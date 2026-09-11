import { Router } from 'express';
import { prisma } from '../db';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';
import { getAdminMetrics } from '../presence';
import { Server } from 'socket.io';
import { recordAuditLog } from '../audit';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorMiddleware';
import bcrypt from 'bcrypt';

export default function createAdminRouter(io: Server) {
  const router = Router();
  router.use(authenticate, requireAdmin);

  router.get('/participants', asyncHandler(async (_req, res) => {
    const participants = await prisma.user.findMany({ where: { role: 'PARTICIPANT' }, select: { id: true, name: true, email: true, college: true, collegeId: true, status: true, workstation: true } });
    res.json(participants);
  }));

  router.get('/participants/search', asyncHandler(async (req, res) => {
    const query = String(req.query.q || '');
    const status = req.query.status ? String(req.query.status) : undefined;
    const participants = await prisma.user.findMany({
      where: { role: 'PARTICIPANT', ...(status ? { status } : {}), ...(query ? { OR: [{ name: { contains: query } }, { email: { contains: query } }, { collegeId: { contains: query } }] } : {}) },
      include: { workstation: true, evaluations: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(participants);
  }));

  router.get('/participants/:id', asyncHandler(async (req, res) => {
    const participantId = req.params.id as string;
    const participant = await prisma.user.findFirst({ where: { id: participantId, role: 'PARTICIPANT' }, include: { workstation: true, evaluations: true, submissions: { orderBy: { createdAt: 'desc' } } } });
    if (!participant) throw new AppError(404, 'Participant not found');
    res.json(participant);
  }));

  router.post('/participants', asyncHandler(async (req: any, res) => {
    const { name, email, password, college, collegeId, phone } = req.body;
    if (!name || !email || !password) throw new AppError(400, 'Name, email, and password are required');
    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const participant = await prisma.user.create({ data: { name, email, passwordHash, college, collegeId, phone, role: 'PARTICIPANT' } });
    await recordAuditLog(req.user.id, 'PARTICIPANT_CHECKIN', `Participant ${participant.id} manually registered`);
    res.status(201).json(participant);
  }));

  router.put('/participants/:id', asyncHandler(async (req: any, res) => {
    const { name, email, college, collegeId, phone } = req.body;
    const participant = await prisma.user.update({ where: { id: req.params.id }, data: { name, email, college, collegeId, phone } });
    res.json(participant);
  }));

  router.delete('/participants/:id', asyncHandler(async (req: any, res) => {
    await prisma.user.update({ where: { id: req.params.id }, data: { status: 'CANCELLED', lockedAt: new Date() } });
    await recordAuditLog(req.user.id, 'PARTICIPANT_DISQUALIFY', `Participant ${req.params.id} registration cancelled`);
    res.status(204).send();
  }));

  router.get('/participants/:id/status-history', asyncHandler(async (req, res) => {
    res.json(await prisma.participantStatusHistory.findMany({ where: { participantId: req.params.id as string }, orderBy: { createdAt: 'desc' } }));
  }));

  router.get('/metrics', asyncHandler(async (_req, res) => {
    res.json(await getAdminMetrics());
  }));

  router.put('/participants/:id/status', asyncHandler(async (req: any, res) => {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!['REGISTERED', 'CHECKED_IN', 'DISQUALIFIED'].includes(status)) throw new AppError(400, 'Invalid status');

    const current = await prisma.user.findUnique({ where: { id }, select: { status: true, role: true } });
    if (!current || current.role !== 'PARTICIPANT') throw new AppError(404, 'Participant not found');
    const reason = req.body.reason ? String(req.body.reason) : undefined;
    if (status === 'DISQUALIFIED' && !reason) throw new AppError(400, 'Disqualification reason is required');
    const updated = await prisma.user.update({ where: { id }, data: { status, checkedInAt: status === 'CHECKED_IN' ? new Date() : undefined, collegeIdVerified: status === 'CHECKED_IN' ? Boolean(req.body.collegeIdVerified ?? true) : undefined, disqualificationReason: status === 'DISQUALIFIED' ? reason : undefined, lockedAt: status === 'DISQUALIFIED' ? new Date() : undefined } });
    await prisma.participantStatusHistory.create({ data: { participantId: id, adminId: req.user.id, fromStatus: current.status, toStatus: status, reason } });
    if (status === 'CHECKED_IN' || status === 'DISQUALIFIED') {
      await recordAuditLog(req.user.id, status === 'CHECKED_IN' ? 'PARTICIPANT_CHECKIN' : 'PARTICIPANT_DISQUALIFY', `Participant ${id} status changed to ${status}`);
    }
    void getAdminMetrics().then((metrics) => io.to('ADMIN').emit('ADMIN_METRICS_UPDATE', metrics));
    res.json(updated);
  }));

  router.get('/workstations', asyncHandler(async (_req, res) => {
    const workstations = await prisma.workstation.findMany({ include: { participant: { select: { name: true, email: true } } } });
    res.json(workstations);
  }));

  router.post('/workstations/assign', asyncHandler(async (req: any, res) => {
    const { pcNumber, participantId } = req.body;
    if (!pcNumber || !participantId) throw new AppError(400, 'pcNumber and participantId are required');

    const workstation = await prisma.$transaction(async (transaction) => {
      const participant = await transaction.user.findUnique({ where: { id: participantId }, select: { id: true, role: true } });
      if (!participant || participant.role !== 'PARTICIPANT') throw new AppError(404, 'Participant not found');
      await transaction.workstation.deleteMany({ where: { participantId } });
      const assigned = await transaction.workstation.upsert({ where: { pcNumber }, update: { participantId }, create: { pcNumber, participantId } });
      await transaction.workstationAssignmentHistory.create({ data: { workstationId: assigned.id, pcNumber, participantId, adminId: req.user.id, action: 'ASSIGN' } });
      return assigned;
    });

    await recordAuditLog(req.user.id, 'WORKSTATION_ASSIGN', `Workstation ${pcNumber} assigned to participant ${participantId}`);
    res.json(workstation);
  }));

  router.delete('/workstations/:id/release', asyncHandler(async (req: any, res) => {
    const workstation = await prisma.workstation.findUnique({ where: { id: req.params.id } });
    if (!workstation) throw new AppError(404, 'Workstation not found');
    await prisma.workstation.update({ where: { id: workstation.id }, data: { participantId: null } });
    await prisma.workstationAssignmentHistory.create({ data: { workstationId: workstation.id, pcNumber: workstation.pcNumber, participantId: workstation.participantId, adminId: req.user.id, action: 'RELEASE' } });
    res.status(204).send();
  }));

  router.get('/workstations/:id/history', asyncHandler(async (req, res) => {
    res.json(await prisma.workstationAssignmentHistory.findMany({ where: { workstationId: req.params.id as string }, orderBy: { createdAt: 'desc' } }));
  }));

  router.post('/problems', asyncHandler(async (req: any, res) => {
    const { title, description, inputFormat, outputFormat, constraints, difficulty, timeLimit, memoryLimit, roundId } = req.body;
    const problem = await prisma.problem.create({ data: { title, description, inputFormat, outputFormat, constraints, difficulty, timeLimit, memoryLimit, roundId } });
    await recordAuditLog(req.user.id, 'PROBLEM_CREATE', `Problem ${problem.id} (${problem.title}) created for round ${roundId}`);
    res.status(201).json(problem);
  }));

  router.put('/problems/:id', asyncHandler(async (req: any, res) => {
    const id = req.params.id as string;
    const { title, description, inputFormat, outputFormat, constraints, difficulty, timeLimit, memoryLimit, roundId } = req.body;
    const problem = await prisma.problem.update({ where: { id }, data: { title, description, inputFormat, outputFormat, constraints, difficulty, timeLimit, memoryLimit, roundId } });
    await recordAuditLog(req.user.id, 'PROBLEM_UPDATE', `Problem ${problem.id} (${problem.title}) updated`);
    res.json(problem);
  }));

  router.get('/problems', asyncHandler(async (_req, res) => {
    res.json(await prisma.problem.findMany({ include: { round: true, examples: true, testCases: true }, orderBy: { title: 'asc' } }));
  }));

  router.get('/problems/:id', asyncHandler(async (req, res) => {
    const problem = await prisma.problem.findUnique({ where: { id: req.params.id as string }, include: { round: true, examples: true, testCases: true } });
    if (!problem) throw new AppError(404, 'Problem not found');
    res.json(problem);
  }));

  router.delete('/problems/:id', asyncHandler(async (req: any, res) => {
    await prisma.problem.delete({ where: { id: req.params.id } });
    await recordAuditLog(req.user.id, 'PROBLEM_UPDATE', `Problem ${req.params.id} deleted`);
    res.status(204).send();
  }));

  router.post('/problems/:id/duplicate', asyncHandler(async (req: any, res) => {
    const source = await prisma.problem.findUnique({ where: { id: req.params.id }, include: { examples: true, testCases: true } });
    if (!source) throw new AppError(404, 'Problem not found');
    const copy = await prisma.problem.create({ data: { title: `${source.title} (Copy)`, description: source.description, inputFormat: source.inputFormat, outputFormat: source.outputFormat, constraints: source.constraints, difficulty: source.difficulty, timeLimit: source.timeLimit, memoryLimit: source.memoryLimit, roundId: req.body.roundId || source.roundId, examples: { create: source.examples.map((example) => ({ input: example.input, output: example.output, explanation: example.explanation })) }, testCases: { create: source.testCases.map((testCase) => ({ input: testCase.input, output: testCase.output, isHidden: testCase.isHidden })) } } });
    await recordAuditLog(req.user.id, 'PROBLEM_CREATE', `Problem ${copy.id} duplicated from ${source.id}`);
    res.status(201).json(copy);
  }));

  router.post('/problems/:id/test-cases', asyncHandler(async (req, res) => {
    const { input, output, isHidden = true } = req.body;
    if (input === undefined || output === undefined) throw new AppError(400, 'Input and output are required');
    res.status(201).json(await prisma.testCase.create({ data: { problemId: req.params.id as string, input, output, isHidden: Boolean(isHidden) } }));
  }));

  router.post('/problems/:id/examples', asyncHandler(async (req, res) => {
    const { input, output, explanation } = req.body;
    if (input === undefined || output === undefined) throw new AppError(400, 'Input and output are required');
    res.status(201).json(await prisma.problemExample.create({ data: { problemId: req.params.id as string, input, output, explanation } }));
  }));

  router.get('/rounds', asyncHandler(async (_req, res) => {
    res.json(await prisma.round.findMany({ include: { problems: { select: { id: true, title: true } } }, orderBy: { name: 'asc' } }));
  }));

  router.post('/rounds', asyncHandler(async (req: any, res) => {
    const { name, duration, lateEntryCutoffMinutes = 10, autoSubmitOnEnd = true } = req.body;
    if (!name || !Number.isFinite(Number(duration)) || Number(duration) <= 0) throw new AppError(400, 'Round name and positive duration are required');
    const round = await prisma.round.create({ data: { name, duration: Number(duration), lateEntryCutoffMinutes: Number(lateEntryCutoffMinutes), autoSubmitOnEnd: Boolean(autoSubmitOnEnd) } });
    await recordAuditLog(req.user.id, 'ROUND_START', `Round ${round.id} created and configured`);
    res.status(201).json(round);
  }));

  router.put('/rounds/:id', asyncHandler(async (req: any, res) => {
    const round = await prisma.round.update({ where: { id: req.params.id }, data: { name: req.body.name, duration: req.body.duration === undefined ? undefined : Number(req.body.duration), lateEntryCutoffMinutes: req.body.lateEntryCutoffMinutes === undefined ? undefined : Number(req.body.lateEntryCutoffMinutes), autoSubmitOnEnd: req.body.autoSubmitOnEnd } });
    res.json(round);
  }));

  router.post('/rounds/:id/reset', asyncHandler(async (req: any, res) => {
    const round = await prisma.round.update({ where: { id: req.params.id }, data: { status: 'PENDING', startTime: null, endTime: null, pausedAt: null } });
    await recordAuditLog(req.user.id, 'ROUND_END', `Round ${round.id} reset`);
    res.json(round);
  }));

  router.get('/submissions', asyncHandler(async (req, res) => {
    const submissions = await prisma.submission.findMany({ where: { ...(req.query.participantId ? { participantId: String(req.query.participantId) } : {}), ...(req.query.problemId ? { problemId: String(req.query.problemId) } : {}), ...(req.query.status ? { status: String(req.query.status) } : {}) }, include: { participant: { select: { name: true, email: true } }, problem: { include: { round: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(submissions);
  }));

  router.get('/submissions/:id', asyncHandler(async (req, res) => {
    const submission = await prisma.submission.findUnique({ where: { id: req.params.id as string }, include: { participant: true, problem: { include: { round: true } } } });
    if (!submission) throw new AppError(404, 'Submission not found');
    res.json(submission);
  }));

  router.get('/evaluations', asyncHandler(async (_req, res) => {
    const evaluations = await prisma.evaluation.findMany({ include: { participant: { select: { name: true, email: true } } } });
    res.json(evaluations);
  }));

  router.post('/evaluations/:id/lock', asyncHandler(async (req: any, res) => {
    const evaluation = await prisma.evaluation.update({ where: { id: req.params.id }, data: { lockedAt: new Date(), lockedBy: req.user.id } });
    await recordAuditLog(req.user.id, 'SCORE_ADJUSTMENT', `Evaluation ${evaluation.id} locked`);
    res.json(evaluation);
  }));

  router.post('/evaluations/:id/unlock', asyncHandler(async (req: any, res) => {
    const evaluation = await prisma.evaluation.update({ where: { id: req.params.id }, data: { lockedAt: null, lockedBy: null } });
    res.json(evaluation);
  }));

  router.put('/evaluations/:participantId', asyncHandler(async (req: any, res) => {
    const { codeQuality = 0, logicClarity = 0, judgeComments } = req.body;
    const quality = Number(codeQuality);
    const clarity = Number(logicClarity);
    if (![quality, clarity].every(Number.isFinite)) throw new AppError(400, 'Evaluation scores must be valid numbers');
    const existing = await prisma.evaluation.findUnique({ where: { participantId: req.params.participantId as string } });
    if (existing?.lockedAt) throw new AppError(409, 'Evaluation is locked');
    const evaluation = await prisma.evaluation.upsert({ where: { participantId: req.params.participantId as string }, update: { codeQuality: quality, logicClarity: clarity, judgeComments }, create: { participantId: req.params.participantId as string, codeQuality: quality, logicClarity: clarity, judgeComments } });
    await recordAuditLog(req.user.id, 'SCORE_ADJUSTMENT', `Judge evaluation updated for participant ${req.params.participantId}`);
    res.json(evaluation);
  }));

  router.post('/scores/adjust', asyncHandler(async (req: any, res) => {
    const { participantId, round1Score, round2Score, manualAdjustments, judgeComments } = req.body;
    if (!participantId) throw new AppError(400, 'participantId is required');
    const scores = [round1Score, round2Score, manualAdjustments].map((score) => Number(score ?? 0));
    if (scores.some((score) => !Number.isFinite(score))) throw new AppError(400, 'Scores must be valid numbers');
    const [normalizedRound1Score, normalizedRound2Score, normalizedManualAdjustments] = scores;
    const finalScore = normalizedRound1Score + normalizedRound2Score + normalizedManualAdjustments;
    const existingEvaluation = await prisma.evaluation.findUnique({ where: { participantId }, select: { lockedAt: true } });
    if (existingEvaluation?.lockedAt) throw new AppError(409, 'Evaluation is locked');
    const evaluation = await prisma.evaluation.upsert({
      where: { participantId },
      update: { round1Score: normalizedRound1Score, round2Score: normalizedRound2Score, manualAdjustments: normalizedManualAdjustments, judgeComments, finalScore },
      create: { participantId, round1Score: normalizedRound1Score, round2Score: normalizedRound2Score, manualAdjustments: normalizedManualAdjustments, judgeComments, finalScore }
    });
    await prisma.scoreAdjustment.create({ data: { participantId, adminId: req.user.id, round1Score: normalizedRound1Score, round2Score: normalizedRound2Score, manualAdjustments: normalizedManualAdjustments, finalScore, reason: String(req.body.reason || 'Manual score adjustment') } });
    await recordAuditLog(req.user.id, 'SCORE_ADJUSTMENT', `Adjusted score for participant ${participantId}`);
    res.json(evaluation);
  }));

  router.get('/scores/:participantId/history', asyncHandler(async (req, res) => {
    res.json(await prisma.scoreAdjustment.findMany({ where: { participantId: req.params.participantId as string }, orderBy: { createdAt: 'desc' } }));
  }));

  router.post('/scores/:adjustmentId/reverse', asyncHandler(async (req: any, res) => {
    const adjustment = await prisma.scoreAdjustment.findUnique({ where: { id: req.params.adjustmentId } });
    if (!adjustment || adjustment.reversedAt) throw new AppError(404, 'Active score adjustment not found');
    const evaluation = await prisma.evaluation.update({ where: { participantId: adjustment.participantId }, data: { round1Score: 0, round2Score: 0, manualAdjustments: 0, finalScore: 0 } });
    const reversed = await prisma.scoreAdjustment.update({ where: { id: adjustment.id }, data: { reversedAt: new Date(), reversedBy: req.user.id } });
    await recordAuditLog(req.user.id, 'SCORE_ADJUSTMENT', `Score adjustment ${adjustment.id} reversed for participant ${adjustment.participantId}`);
    res.json({ evaluation, adjustment: reversed });
  }));

  router.get('/audit-logs', asyncHandler(async (req, res) => {
    const logs = await prisma.auditLog.findMany({ where: req.query.actionType ? { actionType: String(req.query.actionType) } : undefined, orderBy: { timestamp: 'desc' }, take: Math.min(Number(req.query.limit || 100), 500) });
    res.json(logs);
  }));

  router.get('/settings', asyncHandler(async (_req, res) => {
    res.json(await prisma.contestSetting.findMany({ orderBy: { key: 'asc' } }));
  }));

  router.put('/settings/:key', asyncHandler(async (req: any, res) => {
    if (req.body.value === undefined) throw new AppError(400, 'Setting value is required');
    const setting = await prisma.contestSetting.upsert({ where: { key: req.params.key }, update: { value: String(req.body.value), updatedBy: req.user.id }, create: { key: req.params.key, value: String(req.body.value), updatedBy: req.user.id } });
    res.json(setting);
  }));

  router.put('/users/:id/role', asyncHandler(async (req: any, res) => {
    const role = String(req.body.role || '');
    if (!['ADMIN', 'JUDGE', 'PARTICIPANT'].includes(role)) throw new AppError(400, 'Invalid role');
    const user = await prisma.user.update({ where: { id: req.params.id as string }, data: { role } });
    res.json(user);
  }));

  router.get('/sudden-death', asyncHandler(async (_req, res) => {
    res.json(await prisma.suddenDeathRound.findMany({ orderBy: { createdAt: 'desc' } }));
  }));

  router.post('/sudden-death', asyncHandler(async (req: any, res) => {
    const { name = 'Sudden Death', duration, participantIds, bonusPoints = 0, problemId } = req.body;
    if (!Number.isFinite(Number(duration)) || !Array.isArray(participantIds) || participantIds.length < 2) throw new AppError(400, 'Sudden death requires duration and at least two participants');
    const round = await prisma.suddenDeathRound.create({ data: { name, duration: Number(duration), participantIds: JSON.stringify(participantIds), bonusPoints: Number(bonusPoints), problemId, createdBy: req.user.id } });
    res.status(201).json(round);
  }));

  router.post('/sudden-death/:id/start', asyncHandler(async (req: any, res) => {
    const round = await prisma.suddenDeathRound.update({ where: { id: req.params.id as string }, data: { status: 'ACTIVE', startTime: new Date() } });
    await recordAuditLog(req.user.id, 'ROUND_START', `Sudden-death round ${round.id} started`);
    res.json(round);
  }));

  router.post('/sudden-death/:id/end', asyncHandler(async (req: any, res) => {
    const round = await prisma.suddenDeathRound.update({ where: { id: req.params.id as string }, data: { status: 'ENDED', endTime: new Date() } });
    await recordAuditLog(req.user.id, 'ROUND_END', `Sudden-death round ${round.id} ended`);
    res.json(round);
  }));

  return router;
}

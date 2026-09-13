import { Router } from 'express';
import { prisma } from '../db';
import { authenticate } from '../middleware/authMiddleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorMiddleware';
import { Server } from 'socket.io';
import { submissionsQueue } from '../queue';
import { rateLimit } from '../middleware/rateLimit';
import { generateDeviceFingerprint } from '../antiCheat';

export default function createContestRouter(io: Server) {
  const router = Router();
  router.use(authenticate);
  router.use('/submit', rateLimit(60_000, 30));

  router.get('/assignment', asyncHandler(async (_req, res) => {
    const activeRound = await prisma.round.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        problems: {
          select: {
            id: true, title: true, description: true, inputFormat: true,
            outputFormat: true, constraints: true, timeLimit: true, memoryLimit: true
          }
        }
      }
    });

    if (!activeRound) throw new AppError(404, 'No active round currently running');
    res.json(activeRound);
  }));

  router.get('/dashboard', asyncHandler(async (req: any, res) => {
    const activeRound = await prisma.round.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        problems: {
          select: {
            id: true, title: true, description: true, inputFormat: true,
            outputFormat: true, constraints: true, timeLimit: true, memoryLimit: true
          }
        }
      }
    });

    if (!activeRound) return res.json({ round: null });

    const [attempted, solved, evaluation] = await Promise.all([
      prisma.submission.findMany({ where: { participantId: req.user.id, problem: { roundId: activeRound.id } }, select: { problemId: true }, distinct: ['problemId'] }),
      prisma.submission.findMany({ where: { participantId: req.user.id, problem: { roundId: activeRound.id }, status: 'ACCEPTED' }, select: { problemId: true }, distinct: ['problemId'] }),
      prisma.evaluation.findUnique({ where: { participantId: req.user.id }, select: { finalScore: true } }),
    ]);

    const { getParticipantRank } = await import('../redis');
    const rankIndex = evaluation ? await getParticipantRank(req.user.id) : null;
    res.json({
      round: { id: activeRound.id, name: activeRound.name, duration: activeRound.duration, startTime: activeRound.startTime, problems: activeRound.problems },
      stats: { solved: solved.length, attempted: attempted.length, totalProblems: activeRound.problems.length, score: evaluation?.finalScore || 0, rank: rankIndex }
    });
  }));

  router.post('/submit', asyncHandler(async (req: any, res) => {
    const { problemId, roundId, language, sourceCode } = req.body;
    const participantId = req.user.id;
    const ip = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!problemId || !roundId || !language || !sourceCode) {
      throw new AppError(400, 'Missing submission fields');
    }
    if (typeof sourceCode !== 'string' || sourceCode.length > 100_000 || language.length > 32) {
      throw new AppError(400, 'Source code must be under 100 KB');
    }

    const participant = await prisma.user.findUnique({ where: { id: participantId }, select: { role: true, status: true } });
    if (!participant || participant.role !== 'PARTICIPANT') throw new AppError(403, 'Only participants can submit code');
    if (participant.status === 'DISQUALIFIED') throw new AppError(403, 'Disqualified participants cannot submit code');

    const deviceFingerprint = generateDeviceFingerprint(userAgent || '', ip || '');

    const submission = await prisma.$transaction(async (transaction) => {
      const round = await transaction.round.findUnique({ where: { id: roundId }, select: { id: true, status: true, endTime: true } });
      if (!round || round.status !== 'ACTIVE') throw new AppError(409, 'Round is not active');
      if (round.endTime && new Date() >= round.endTime) throw new AppError(409, 'Round has ended');

      const problem = await transaction.problem.findUnique({ where: { id: problemId }, select: { roundId: true } });
      if (!problem || problem.roundId !== roundId) throw new AppError(400, 'Problem does not belong to the requested round');

      return transaction.submission.create({ 
        data: { 
          participantId, 
          problemId, 
          language, 
          sourceCode, 
          status: 'PENDING',
          ipAddress: ip,
          deviceFingerprint
        } 
      });
    });

    try {
      await submissionsQueue.add('judge', { submissionId: submission.id });
    } catch (queueError) {
      await prisma.submission.update({ 
        where: { id: submission.id }, 
        data: { status: 'QUEUE_FAILED' } 
      });
      throw new AppError(503, 'Submission queue unavailable. Please try again.');
    }

    res.status(202).json(submission);
  }));

  router.get('/submissions/:id', asyncHandler(async (req: any, res) => {
    const submission = await prisma.submission.findFirst({ where: { id: req.params.id, participantId: req.user.id } });
    if (!submission) throw new AppError(404, 'Submission not found');
    res.json(submission);
  }));

  return router;
}

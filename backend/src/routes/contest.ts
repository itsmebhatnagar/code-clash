import { Router } from 'express';
import { prisma } from '../db';
import { authenticate } from '../middleware/authMiddleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorMiddleware';
import { Server } from 'socket.io';
import { submissionsQueue } from '../queue';
import { rateLimit } from '../middleware/rateLimit';
import { generateDeviceFingerprint } from '../antiCheat';
import { getRoundEndDelayMs, getRoundPhase } from '../services/contestService';

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
            outputFormat: true, constraints: true, timeLimit: true, memoryLimit: true, points: true
          }
        }
      }
    });

    if (!activeRound) throw new AppError(404, 'No active round currently running');
    const readingEndsAt = activeRound.roundType === 'CODE_IN_DARK' && activeRound.startTime
      ? new Date(activeRound.startTime.getTime() + activeRound.readingPeriodSeconds * 1000).toISOString()
      : null;
    const endsAt = activeRound.startTime
      ? new Date(activeRound.startTime.getTime() + getRoundEndDelayMs(activeRound.duration, activeRound.readingPeriodSeconds)).toISOString()
      : null;
    res.json({ ...activeRound, phase: getRoundPhase(activeRound), readingEndsAt, endsAt });
  }));

  router.get('/dashboard', asyncHandler(async (req: any, res) => {
    const activeRound = await prisma.round.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        problems: {
          select: {
            id: true, title: true, description: true, inputFormat: true,
            outputFormat: true, constraints: true, timeLimit: true, memoryLimit: true, points: true
          }
        }
      }
    });

    if (!activeRound) return res.json({ round: null });

    const [attempted, solved, evaluation] = await Promise.all([
      prisma.submission.findMany({ where: { participantId: req.user.id, problem: { roundId: activeRound.id } }, select: { problemId: true }, distinct: ['problemId'] }),
      prisma.submission.findMany({ where: { participantId: req.user.id, problem: { roundId: activeRound.id }, status: 'ACCEPTED' }, select: { problemId: true }, distinct: ['problemId'] }),
      prisma.evaluation.findUnique({ where: { participantId: req.user.id }, select: { finalScore: true, tieBreakTimeMs: true } }),
    ]);

    const rankIndex = evaluation ? (await prisma.evaluation.count({
      where: {
        participant: { status: { not: 'DISQUALIFIED' } },
        OR: [
          { finalScore: { gt: evaluation.finalScore } },
          { finalScore: evaluation.finalScore, tieBreakTimeMs: { lt: evaluation.tieBreakTimeMs } },
          { finalScore: evaluation.finalScore, tieBreakTimeMs: evaluation.tieBreakTimeMs, participantId: { lt: req.user.id } },
        ],
      },
    })) + 1 : null;
    const readingEndsAt = activeRound.roundType === 'CODE_IN_DARK' && activeRound.startTime
      ? new Date(activeRound.startTime.getTime() + activeRound.readingPeriodSeconds * 1000).toISOString()
      : null;
    const endsAt = activeRound.startTime
      ? new Date(activeRound.startTime.getTime() + getRoundEndDelayMs(activeRound.duration, activeRound.readingPeriodSeconds)).toISOString()
      : null;
    res.json({
      round: { id: activeRound.id, name: activeRound.name, roundType: activeRound.roundType, phase: getRoundPhase(activeRound), readingPeriodSeconds: activeRound.readingPeriodSeconds, readingEndsAt, endsAt, duration: activeRound.duration, startTime: activeRound.startTime, problems: activeRound.problems },
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
    if (typeof sourceCode !== 'string' || sourceCode.length > 100_000) {
      throw new AppError(400, 'Source code must be under 100 KB');
    }
    const supportedLanguages = ['c', 'cpp', 'c++', 'java', 'python', 'python3'];
    if (typeof language !== 'string' || !supportedLanguages.includes(language.toLowerCase())) {
      throw new AppError(400, 'Supported languages are C, C++, Java, and Python');
    }

    const participant = await prisma.user.findUnique({ where: { id: participantId }, select: { role: true, status: true } });
    if (!participant || participant.role !== 'PARTICIPANT') throw new AppError(403, 'Only participants can submit code');
    if (participant.status === 'DISQUALIFIED') throw new AppError(403, 'Disqualified participants cannot submit code');

    const deviceFingerprint = generateDeviceFingerprint(userAgent || '', ip || '');

    const submission = await prisma.$transaction(async (transaction) => {
      const round = await transaction.round.findUnique({ where: { id: roundId }, select: { id: true, status: true, endTime: true, startTime: true, duration: true, roundType: true, readingPeriodSeconds: true } });
      if (!round || round.status !== 'ACTIVE') throw new AppError(409, 'Round is not active');
      if (round.endTime && new Date() >= round.endTime) throw new AppError(409, 'Round has ended');
      if (round.startTime && new Date() >= new Date(round.startTime.getTime() + getRoundEndDelayMs(round.duration, round.readingPeriodSeconds))) {
        throw new AppError(409, 'Round has ended');
      }
      if (getRoundPhase(round) === 'READING') throw new AppError(409, 'Code in the Dark reading period is still active');

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

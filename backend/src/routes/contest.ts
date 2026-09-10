import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authMiddleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorMiddleware';
import { Server } from 'socket.io';
import { enqueueSubmission } from '../judgeWorker';

const prisma = new PrismaClient();

export default function createContestRouter(io: Server) {
  const router = Router();
  router.use(authenticate);

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

  router.post('/submit', asyncHandler(async (req: any, res) => {
    const { problemId, roundId, language, sourceCode } = req.body;
    const participantId = req.user.id;

    if (!problemId || !roundId || !language || !sourceCode) {
      throw new AppError(400, 'Missing submission fields');
    }
    if (typeof sourceCode !== 'string' || sourceCode.length > 100_000) {
      throw new AppError(400, 'Source code must be under 100 KB');
    }

    const participant = await prisma.user.findUnique({ where: { id: participantId }, select: { role: true, status: true } });
    if (!participant || participant.role !== 'PARTICIPANT') throw new AppError(403, 'Only participants can submit code');
    if (participant.status === 'DISQUALIFIED') throw new AppError(403, 'Disqualified participants cannot submit code');

    const submission = await prisma.$transaction(async (transaction) => {
      const round = await transaction.round.findUnique({ where: { id: roundId }, select: { id: true, status: true } });
      if (!round || round.status !== 'ACTIVE') throw new AppError(409, 'Round is not active');

      const problem = await transaction.problem.findUnique({ where: { id: problemId }, select: { roundId: true } });
      if (!problem || problem.roundId !== roundId) throw new AppError(400, 'Problem does not belong to the requested round');

      return transaction.submission.create({ data: { participantId, problemId, language, sourceCode, status: 'PENDING' } });
    });

    enqueueSubmission(submission.id, io);
    res.status(202).json(submission);
  }));

  router.get('/submissions/:id', asyncHandler(async (req: any, res) => {
    const submission = await prisma.submission.findFirst({ where: { id: req.params.id, participantId: req.user.id } });
    if (!submission) throw new AppError(404, 'Submission not found');
    res.json(submission);
  }));

  return router;
}

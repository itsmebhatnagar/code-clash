import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
const prisma = new PrismaClient();

router.get('/', asyncHandler(async (_req, res) => {
  const evaluations = await prisma.evaluation.findMany({
    include: {
      participant: {
        select: { id: true, name: true, college: true, status: true }
      }
    },
    where: {
      participant: { status: { not: 'DISQUALIFIED' } }
    },
    orderBy: { finalScore: 'desc' }
  });

  const rankedBoard = evaluations.map((evalRecord, index) => ({
    rank: index + 1,
    participantId: evalRecord.participant.id,
    name: evalRecord.participant.name,
    college: evalRecord.participant.college,
    round1Score: evalRecord.round1Score,
    round2Score: evalRecord.round2Score,
    manualAdjustments: evalRecord.manualAdjustments,
    finalScore: evalRecord.finalScore,
    status: evalRecord.participant.status
  }));

  res.json({ leaderboard: rankedBoard });
}));

export default router;

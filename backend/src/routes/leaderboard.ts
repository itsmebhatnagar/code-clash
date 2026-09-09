import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get the live leaderboard
router.get('/', async (req: Request, res: Response) => {
  try {
    // Fetch all evaluations joined with participant data
    const evaluations = await prisma.evaluation.findMany({
      include: {
        participant: {
          select: { id: true, name: true, college: true, status: true }
        }
      },
      // Only show participants who aren't disqualified
      where: {
        participant: { status: { not: 'DISQUALIFIED' } }
      },
      orderBy: {
        finalScore: 'desc'
      }
    });

    // Handle Ties / Sudden Death detection
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate leaderboard' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/assignment', async (req: any, res: Response): Promise<void> => {
  try {
    const activeRound = await prisma.round.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        problems: {
          select: {
            id: true,
            title: true,
            description: true,
            inputFormat: true,
            outputFormat: true,
            constraints: true,
            timeLimit: true,
            memoryLimit: true,
          }
        }
      }
    });

    if (!activeRound) {
      res.status(404).json({ message: 'No active round currently running' });
      return;
    }

    res.json(activeRound);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

router.post('/submit', async (req: any, res: Response): Promise<void> => {
  try {
    const { problemId, roundId, language, sourceCode } = req.body;
    const participantId = req.user.id;

    if (!problemId || !roundId || !language || !sourceCode) {
      res.status(400).json({ error: 'Missing submission fields' });
      return;
    }

    const submission = await prisma.submission.create({
      data: {
        participantId,
        problemId,
        language,
        sourceCode,
        status: 'PENDING'
      }
    });

    const testCases = await prisma.testCase.findMany({
      where: { problemId }
    });

    const passedCases = Math.floor(Math.random() * (testCases.length + 1));
    const isAccepted = testCases.length > 0 && passedCases === testCases.length;
    
    const updatedSubmission = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: isAccepted ? 'ACCEPTED' : 'WRONG_ANSWER',
        executionTime: Math.floor(Math.random() * 100) + 10,
        passedCases,
        totalCases: testCases.length
      }
    });

    res.json(updatedSubmission);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process submission' });
  }
});

export default router;

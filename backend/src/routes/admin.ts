import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();
const prisma = new PrismaClient();

// Apply auth and admin middleware to all routes in this file
router.use(authenticate, requireAdmin);


router.get('/participants', async (req: Request, res: Response) => {
  try {
    const participants = await prisma.user.findMany({
      where: { role: 'PARTICIPANT' },
      select: { id: true, name: true, email: true, college: true, collegeId: true, status: true, workstation: true }
    });
    res.json(participants);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

router.put('/participants/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    
    if (!['REGISTERED', 'CHECKED_IN', 'DISQUALIFIED'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});


router.get('/workstations', async (req: Request, res: Response) => {
  try {
    const workstations = await prisma.workstation.findMany({
      include: { participant: { select: { name: true, email: true } } }
    });
    res.json(workstations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workstations' });
  }
});

router.post('/workstations/assign', async (req: Request, res: Response): Promise<void> => {
  try {
    const { pcNumber, participantId } = req.body;
    
    const workstation = await prisma.workstation.upsert({
      where: { pcNumber },
      update: { participantId },
      create: { pcNumber, participantId }
    });
    
    res.json(workstation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign workstation' });
  }
});


router.post('/problems', async (req: Request, res: Response) => {
  try {
    const { title, description, inputFormat, outputFormat, constraints, difficulty, timeLimit, memoryLimit, roundId } = req.body;
    
    const problem = await prisma.problem.create({
      data: { title, description, inputFormat, outputFormat, constraints, difficulty, timeLimit, memoryLimit, roundId }
    });
    
    res.status(201).json(problem);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create problem' });
  }
});


router.get('/evaluations', async (req: Request, res: Response) => {
  try {
    const pendingEvaluations = await prisma.evaluation.findMany({
      include: { participant: { select: { name: true, email: true } } }
    });
    res.json(pendingEvaluations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch evaluations' });
  }
});

router.post('/scores/adjust', async (req: any, res: Response): Promise<void> => {
  try {
    const { participantId, round1Score, round2Score, manualAdjustments, judgeComments } = req.body;

    const evaluation = await prisma.evaluation.upsert({
      where: { id: participantId },
      update: { round1Score, round2Score, manualAdjustments, judgeComments, finalScore: (round1Score || 0) + (round2Score || 0) + (manualAdjustments || 0) },
      create: { participantId, round1Score, round2Score, manualAdjustments, judgeComments, finalScore: (round1Score || 0) + (round2Score || 0) + (manualAdjustments || 0) }
    });
    
    await prisma.auditLog.create({
      data: {
        adminId: req.user.id,
        actionType: 'SCORE_ADJUSTMENT',
        description: `Adjusted score for participant ${participantId}`
      }
    });

    res.json(evaluation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update score' });
  }
});

export default router;

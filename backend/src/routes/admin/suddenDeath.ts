import { Router } from 'express';
import { prisma } from '../../db';
import { recordAuditLog } from '../../audit';
import { asyncHandler } from '../../middleware/asyncHandler';
import { AppError } from '../../middleware/errorMiddleware';

export default function createSuddenDeathRoutes() {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await prisma.suddenDeathRound.findMany({ orderBy: { createdAt: 'desc' } }));
  }));

  router.post('/', asyncHandler(async (req: any, res) => {
    const { name = 'Sudden Death', duration, participantIds, bonusPoints = 0, problemId } = req.body;
    if (!Number.isFinite(Number(duration)) || !Array.isArray(participantIds) || participantIds.length < 2) throw new AppError(400, 'Sudden death requires duration and at least two participants');
    const round = await prisma.suddenDeathRound.create({ data: { name, duration: Number(duration), participantIds: JSON.stringify(participantIds), bonusPoints: Number(bonusPoints), problemId, createdBy: req.user.id } });
    res.status(201).json(round);
  }));

  router.post('/:id/start', asyncHandler(async (req: any, res) => {
    const round = await prisma.suddenDeathRound.update({ where: { id: req.params.id as string }, data: { status: 'ACTIVE', startTime: new Date() } });
    await recordAuditLog(req.user.id, 'ROUND_START', `Sudden-death round ${round.id} started`);
    res.json(round);
  }));

  router.post('/:id/end', asyncHandler(async (req: any, res) => {
    const round = await prisma.suddenDeathRound.update({ where: { id: req.params.id as string }, data: { status: 'ENDED', endTime: new Date() } });
    await recordAuditLog(req.user.id, 'ROUND_END', `Sudden-death round ${round.id} ended`);
    res.json(round);
  }));

  return router;
}

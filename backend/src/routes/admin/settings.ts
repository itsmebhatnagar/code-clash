import { Router } from 'express';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/asyncHandler';
import { AppError } from '../../middleware/errorMiddleware';

export default function createSettingsRoutes() {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await prisma.contestSetting.findMany({ orderBy: { key: 'asc' } }));
  }));

  router.put('/:key', asyncHandler(async (req: any, res) => {
    if (req.body.value === undefined) throw new AppError(400, 'Setting value is required');
    const setting = await prisma.contestSetting.upsert({ where: { key: req.params.key }, update: { value: String(req.body.value), updatedBy: req.user.id }, create: { key: req.params.key, value: String(req.body.value), updatedBy: req.user.id } });
    res.json(setting);
  }));

  return router;
}

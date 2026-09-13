import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  listRounds,
  createRound,
  updateRound,
  resetRound,
} from '../../services/contestService';

export default function createRoundRoutes() {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await listRounds());
  }));

  router.post('/', asyncHandler(async (req: any, res) => {
    const round = await createRound(req.body, req.user.id);
    res.status(201).json(round);
  }));

  router.put('/:id', asyncHandler(async (req: any, res) => {
    res.json(await updateRound(req.params.id as string, req.body));
  }));

  router.post('/:id/reset', asyncHandler(async (req: any, res) => {
    res.json(await resetRound(req.params.id as string, req.user.id));
  }));

  return router;
}

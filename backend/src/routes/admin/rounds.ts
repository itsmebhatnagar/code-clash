import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  listRounds,
  createRound,
  updateRound,
  resetRound,
  deleteRound,
  reorderRoundProblems,
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
    res.json(await updateRound(req.params.id as string, req.body, req.user.id));
  }));

  router.post('/:id/reset', asyncHandler(async (req: any, res) => {
    res.json(await resetRound(req.params.id as string, req.user.id));
  }));

  router.put('/:id/problems/reorder', asyncHandler(async (req: any, res) => {
    await reorderRoundProblems(req.params.id as string, req.body.ids, req.user.id);
    res.status(204).send();
  }));

  router.delete('/:id', asyncHandler(async (req: any, res) => {
    await deleteRound(req.params.id as string, req.user.id);
    res.status(204).send();
  }));

  return router;
}

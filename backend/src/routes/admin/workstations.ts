import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  listWorkstations,
  assignWorkstation,
  releaseWorkstation,
  getWorkstationHistory,
} from '../../services/contestService';

export default function createWorkstationRoutes() {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await listWorkstations());
  }));

  router.post('/assign', asyncHandler(async (req: any, res) => {
    const { pcNumber, participantId } = req.body;
    res.json(await assignWorkstation(pcNumber, participantId, req.user.id));
  }));

  router.delete('/:id/release', asyncHandler(async (req: any, res) => {
    await releaseWorkstation(req.params.id as string, req.user.id);
    res.status(204).send();
  }));

  router.get('/:id/history', asyncHandler(async (req, res) => {
    res.json(await getWorkstationHistory(req.params.id as string));
  }));

  return router;
}

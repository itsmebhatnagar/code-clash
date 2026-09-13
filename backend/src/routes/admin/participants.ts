import { Router } from 'express';
import { Server } from 'socket.io';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAdminMetrics } from '../../presence';
import {
  listParticipants,
  searchParticipants,
  getParticipantById,
  getParticipantSubmissions,
  getParticipantEvaluation,
  createParticipant,
  updateParticipant,
  cancelParticipant,
  getParticipantStatusHistory,
  updateParticipantStatus,
} from '../../services/participantService';

export default function createParticipantRoutes(io: Server) {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await listParticipants());
  }));

  router.get('/search', asyncHandler(async (req, res) => {
    const query = req.query.q ? String(req.query.q) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    res.json(await searchParticipants(query, status));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await getParticipantById(req.params.id as string));
  }));

  router.get('/:id/submissions', asyncHandler(async (req, res) => {
    res.json(await getParticipantSubmissions(req.params.id as string));
  }));

  router.get('/:id/evaluation', asyncHandler(async (req, res) => {
    res.json(await getParticipantEvaluation(req.params.id as string));
  }));

  router.post('/', asyncHandler(async (req: any, res) => {
    const participant = await createParticipant(req.body, req.user.id);
    res.status(201).json(participant);
  }));

  router.put('/:id', asyncHandler(async (req: any, res) => {
    res.json(await updateParticipant(req.params.id as string, req.body));
  }));

  router.delete('/:id', asyncHandler(async (req: any, res) => {
    await cancelParticipant(req.params.id as string, req.user.id);
    res.status(204).send();
  }));

  router.get('/:id/status-history', asyncHandler(async (req, res) => {
    res.json(await getParticipantStatusHistory(req.params.id as string));
  }));

  router.put('/:id/status', asyncHandler(async (req: any, res) => {
    const updated = await updateParticipantStatus(req.params.id as string, req.body, req.user.id);
    void getAdminMetrics().then((metrics) => io.to('ADMIN').emit('ADMIN_METRICS_UPDATE', metrics));
    res.json(updated);
  }));

  return router;
}

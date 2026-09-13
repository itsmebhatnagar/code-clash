import { Router } from 'express';
import { Server } from 'socket.io';
import { prisma } from '../../db';
import { authenticate, requireAdmin } from '../../middleware/authMiddleware';
import { getAdminMetrics } from '../../presence';
import { asyncHandler } from '../../middleware/asyncHandler';
import { AppError } from '../../middleware/errorMiddleware';
import { getSuspiciousParticipants, getParticipantSessions } from '../../antiCheat';

import createParticipantRoutes from './participants';
import createWorkstationRoutes from './workstations';
import createProblemRoutes from './problems';
import createRoundRoutes from './rounds';
import createSubmissionRoutes from './submissions';
import createEvaluationRoutes, { createScoreRoutes } from './evaluations';
import createSuddenDeathRoutes from './suddenDeath';
import createSettingsRoutes from './settings';

export default function createAdminRouter(io: Server) {
  const router = Router();
  router.use(authenticate, requireAdmin);

  router.use('/participants', createParticipantRoutes(io));
  router.use('/workstations', createWorkstationRoutes());
  router.use('/problems', createProblemRoutes());
  router.use('/rounds', createRoundRoutes());
  router.use('/submissions', createSubmissionRoutes());
  router.use('/evaluations', createEvaluationRoutes());
  router.use('/scores', createScoreRoutes());
  router.use('/sudden-death', createSuddenDeathRoutes());
  router.use('/settings', createSettingsRoutes());

  router.get('/metrics', asyncHandler(async (_req, res) => {
    res.json(await getAdminMetrics());
  }));

  router.get('/audit-logs', asyncHandler(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      where: req.query.actionType ? { actionType: String(req.query.actionType) } : undefined,
      orderBy: { timestamp: 'desc' },
      take: Math.min(Number(req.query.limit || 100), 500),
    });
    res.json(logs);
  }));

  router.get('/anti-cheat/suspicious', asyncHandler(async (_req, res) => {
    const suspicious = await getSuspiciousParticipants();
    res.json(suspicious);
  }));

  router.get('/anti-cheat/participants/:id/sessions', asyncHandler(async (req, res) => {
    const sessions = await getParticipantSessions(String(req.params.id));
    res.json(sessions);
  }));

  router.put('/users/:id/role', asyncHandler(async (req: any, res) => {
    const role = String(req.body.role || '');
    if (!['ADMIN', 'JUDGE', 'PARTICIPANT'].includes(role)) throw new AppError(400, 'Invalid role');
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    res.json(user);
  }));

  return router;
}

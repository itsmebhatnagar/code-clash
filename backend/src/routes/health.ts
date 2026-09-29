import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';

export interface HealthChecks {
  database: () => Promise<unknown>;
  redis: () => Promise<unknown>;
}

const defaultChecks: HealthChecks = {
  database: async () => {
    const { prisma } = await import('../db');
    return prisma.$queryRaw`SELECT 1`;
  },
  redis: async () => {
    const { connection } = await import('../redis');
    if (connection.status !== 'ready') throw new Error('Redis is not ready');
    return connection.ping();
  },
};

export function createHealthRouter(checks: HealthChecks = defaultChecks) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ status: 'ok', message: 'Code Clash Backend is running' });
  });

  router.get('/ready', asyncHandler(async (_req, res) => {
    const [databaseResult, redisResult] = await Promise.allSettled([
      checks.database(),
      checks.redis(),
    ]);
    const checksStatus = {
      database: databaseResult.status === 'fulfilled' ? 'ok' : 'unavailable',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'unavailable',
    };
    const ready = databaseResult.status === 'fulfilled' && redisResult.status === 'fulfilled';

    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks: checksStatus });
  }));

  return router;
}

export default createHealthRouter;
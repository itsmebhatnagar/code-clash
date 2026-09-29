import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createHealthRouter } from '../src/routes/health';
import { errorMiddleware } from '../src/middleware/errorMiddleware';

function createApp(databaseReady: boolean, redisReady: boolean) {
  const app = express();
  app.use('/api/health', createHealthRouter({
    database: async () => {
      if (!databaseReady) throw new Error('database down');
    },
    redis: async () => {
      if (!redisReady) throw new Error('redis down');
    },
  }));
  app.use(errorMiddleware);
  return app;
}

test('health readiness reports healthy dependencies', async () => {
  const res = await request(createApp(true, true)).get('/api/health/ready');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ready', checks: { database: 'ok', redis: 'ok' } });
});

test('health readiness reports unavailable dependencies without leaking details', async () => {
  const res = await request(createApp(true, false)).get('/api/health/ready');

  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { status: 'not_ready', checks: { database: 'ok', redis: 'unavailable' } });
});
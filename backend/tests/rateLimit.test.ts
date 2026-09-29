import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/middleware/rateLimit';

test('rate limit returns 429 with retry timing after the configured request count', async () => {
  const app = express();
  app.use('/rate-limit-test', rateLimit(60_000, 1), (_req, res) => res.sendStatus(204));

  const first = await request(app).get('/rate-limit-test');
  const second = await request(app).get('/rate-limit-test');

  assert.equal(first.status, 204);
  assert.equal(second.status, 429);
  assert.match(second.headers['retry-after'], /^\d+$/);
});

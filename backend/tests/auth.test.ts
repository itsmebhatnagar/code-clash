/**
 * tests/auth.test.ts
 * Authentication – invalid JWT, role escalation, expired token
 */
import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  getApp, cleanDb, seedParticipant, seedAdmin,
  signToken, expiredToken, redisMock
} from './helpers';

describe('Authentication middleware', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('rejects requests with no Authorization header', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/contest/dashboard');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /No token provided/i);
  });

  test('rejects a token signed with the wrong secret', async () => {
    const app = await getApp();
    const badToken = (await import('jsonwebtoken')).default.sign(
      { id: 'x', role: 'PARTICIPANT' },
      'wrong-secret',
      { issuer: 'code-clash', audience: 'code-clash-frontend' }
    );
    const res = await request(app)
      .get('/api/contest/dashboard')
      .set('Authorization', `Bearer ${badToken}`);
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Invalid token/i);
  });

  test('rejects an expired access token', async () => {
    const participant = await seedParticipant();
    const app = await getApp();
    const token = expiredToken({ id: participant.id, role: 'PARTICIPANT' });
    const res = await request(app)
      .get('/api/contest/dashboard')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Token expired/i);
  });

  test('prevents a participant from accessing admin endpoints', async () => {
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });
    const res = await request(app)
      .get('/api/admin/participants')
      .set('Authorization', `Bearer ${token}`);
    // Either 403 (wrong role) or 403 (admin_active missing from Redis)
    assert.equal(res.status, 403);
  });

  test('prevents access to admin endpoints when admin session revoked in Redis', async () => {
    const admin = await seedAdmin();
    const app = await getApp();
    const token = signToken({ id: admin.id, role: 'ADMIN' });
    // Do NOT set admin_active in Redis — simulates a revoked session
    const res = await request(app)
      .get('/api/admin/participants')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Admin session expired or revoked/i);
  });

  test('allows access when admin_active key is present in Redis', async () => {
    const admin = await seedAdmin();
    const app = await getApp();
    const token = signToken({ id: admin.id, role: 'ADMIN' });
    // Simulate active admin session
    await redisMock.set(`admin_active:${admin.id}`, 'true');
    const res = await request(app)
      .get('/api/admin/participants')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
  });
});

describe('Login & logout flow', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('login returns access token and refresh token', async () => {
    await seedParticipant({ email: 'login@test.com', password: 'password123' });
    const app = await getApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'password123' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'should return access token');
    assert.ok(res.body.refreshToken, 'should return refresh token');
  });

  test('login fails with wrong password', async () => {
    await seedParticipant({ email: 'bad@test.com', password: 'correct' });
    const app = await getApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bad@test.com', password: 'wrong' });
    assert.equal(res.status, 401);
  });

  test('refresh endpoint issues new tokens and rotates refresh token', async () => {
    const participant = await seedParticipant({ email: 'refresh@test.com' });
    const app = await getApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'refresh@test.com', password: 'password123' });
    const { refreshToken } = loginRes.body;
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken, userId: participant.id });
    assert.equal(refreshRes.status, 200);
    assert.ok(refreshRes.body.token);
    assert.ok(refreshRes.body.refreshToken);
    assert.notEqual(refreshRes.body.refreshToken, refreshToken, 'refresh token should rotate');
  });

  test('refresh fails after logout (token deleted from Redis)', async () => {
    const participant = await seedParticipant({ email: 'logout@test.com' });
    const app = await getApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'logout@test.com', password: 'password123' });
    const { token, refreshToken } = loginRes.body;

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({ refreshToken });

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken, userId: participant.id });
    assert.equal(refreshRes.status, 401);
  });
});

/**
 * tests/contest.test.ts
 * Contest routes – submission guards, round checks, code size limits
 */
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  getApp, cleanDb, seedParticipant, seedRoundWithProblem, signToken, prisma
} from './helpers';

describe('POST /api/contest/submit', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('rejects submission when there is no active round', async () => {
    const { round, problem } = await seedRoundWithProblem('PENDING');
    const participant = await seedParticipant({ status: 'CHECKED_IN' });
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app)
      .post('/api/contest/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem.id, roundId: round.id, language: 'python', sourceCode: 'print("hello")' });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /not active/i);
  });

  test('rejects submission when problem does not belong to the requested round', async () => {
    const { round } = await seedRoundWithProblem('ACTIVE');
    const { problem: wrongProblem } = await seedRoundWithProblem('ACTIVE');
    const participant = await seedParticipant({ status: 'CHECKED_IN' });
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app)
      .post('/api/contest/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: wrongProblem.id, roundId: round.id, language: 'python', sourceCode: 'print("hello")' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /does not belong/i);
  });

  test('rejects submission from a disqualified participant', async () => {
    const { round, problem } = await seedRoundWithProblem('ACTIVE');
    const participant = await seedParticipant({ status: 'DISQUALIFIED' });
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app)
      .post('/api/contest/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem.id, roundId: round.id, language: 'python', sourceCode: 'print("hello")' });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /Disqualified/i);
  });

  test('rejects submission with oversized source code (> 100 KB)', async () => {
    const { round, problem } = await seedRoundWithProblem('ACTIVE');
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const oversized = 'x'.repeat(100_001);
    const res = await request(app)
      .post('/api/contest/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem.id, roundId: round.id, language: 'python', sourceCode: oversized });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /100 KB/i);
  });

  test('rejects submission with missing required fields', async () => {
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app)
      .post('/api/contest/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'python', sourceCode: 'print("hello")' }); // missing problemId + roundId

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Missing submission fields/i);
  });

  test('accepts a valid submission and queues it (202 Accepted)', async () => {
    const { round, problem } = await seedRoundWithProblem('ACTIVE');
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app)
      .post('/api/contest/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem.id, roundId: round.id, language: 'python', sourceCode: 'print("hello")' });

    assert.equal(res.status, 202);
    assert.ok(res.body.id, 'should return submission id');
    assert.equal(res.body.status, 'PENDING');
  });
});

describe('GET /api/contest/dashboard', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('returns null round when no active round exists', async () => {
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app)
      .get('/api/contest/dashboard')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.round, null);
  });

  test('returns round and stats when an active round exists', async () => {
    const { round } = await seedRoundWithProblem('ACTIVE');
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app)
      .get('/api/contest/dashboard')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.round.id, round.id);
    assert.equal(res.body.stats.solved, 0);
    assert.equal(res.body.stats.attempted, 0);
  });
});

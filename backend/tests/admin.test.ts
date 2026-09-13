/**
 * tests/admin.test.ts
 * Admin routes – check-in, disqualification, workstation assignment, score changes
 */
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  getApp, cleanDb, seedParticipant, seedAdmin,
  signToken, redisMock, prisma
} from './helpers';

async function adminToken() {
  const admin = await seedAdmin();
  await redisMock.set(`admin_active:${admin.id}`, 'true');
  return { admin, token: signToken({ id: admin.id, role: 'ADMIN' }) };
}

describe('Participant check-in', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('marks a participant as CHECKED_IN', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    const res = await request(app)
      .put(`/api/admin/participants/${participant.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CHECKED_IN' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'CHECKED_IN');
  });

  test('rejects an invalid status value', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    const res = await request(app)
      .put(`/api/admin/participants/${participant.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' }); // not a valid participant status

    assert.equal(res.status, 400);
  });
});

describe('Participant disqualification', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('disqualifies a participant with a reason', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant({ status: 'CHECKED_IN' });
    const app = await getApp();

    const res = await request(app)
      .put(`/api/admin/participants/${participant.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISQUALIFIED', reason: 'Cheating detected' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'DISQUALIFIED');
  });

  test('rejects disqualification without a reason', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    const res = await request(app)
      .put(`/api/admin/participants/${participant.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISQUALIFIED' }); // no reason

    assert.equal(res.status, 400);
    assert.match(res.body.error, /reason/i);
  });
});

describe('Workstation assignment', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('assigns a workstation to a participant', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    const res = await request(app)
      .post('/api/admin/workstations/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ pcNumber: 'PC-01', participantId: participant.id });

    assert.equal(res.status, 200);
    assert.equal(res.body.pcNumber, 'PC-01');
    assert.equal(res.body.participantId, participant.id);
  });

  test('reassigning moves workstation to new participant', async () => {
    const { token } = await adminToken();
    const p1 = await seedParticipant({ email: 'p1@test.com' });
    const p2 = await seedParticipant({ email: 'p2@test.com' });
    const app = await getApp();

    await request(app)
      .post('/api/admin/workstations/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ pcNumber: 'PC-02', participantId: p1.id });

    const res = await request(app)
      .post('/api/admin/workstations/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ pcNumber: 'PC-02', participantId: p2.id });

    assert.equal(res.status, 200);
    assert.equal(res.body.participantId, p2.id);
  });

  test('returns 400 when pcNumber or participantId is missing', async () => {
    const { token } = await adminToken();
    const app = await getApp();

    const res = await request(app)
      .post('/api/admin/workstations/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ pcNumber: 'PC-03' }); // missing participantId

    assert.equal(res.status, 400);
  });
});

describe('Score adjustment', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('sets scores and persists finalScore', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    const res = await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        participantId:    participant.id,
        round1Score:      80,
        round2Score:      60,
        manualAdjustments: 5,
        reason:           'Awarded bonus',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.round1Score, 80);
    assert.equal(res.body.round2Score, 60);
    assert.equal(res.body.finalScore,  145);
  });

  test('rejects adjustment without participantId', async () => {
    const { token } = await adminToken();
    const app = await getApp();

    const res = await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ round1Score: 10 });

    assert.equal(res.status, 400);
  });

  test('rejects adjustment when evaluation is locked', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    // Create and lock an evaluation
    await prisma.evaluation.create({
      data: { participantId: participant.id, lockedAt: new Date(), lockedBy: 'admin' },
    });

    const res = await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ participantId: participant.id, round1Score: 50, reason: 'test' });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /locked/i);
  });

  test('reverses a score adjustment', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    const adjustRes = await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ participantId: participant.id, round1Score: 70, round2Score: 30, manualAdjustments: 0, reason: 'First adjustment' });

    // Find the adjustment id from DB
    const adjustments = await prisma.scoreAdjustment.findMany({ where: { participantId: participant.id } });
    assert.equal(adjustments.length, 1);

    const reverseRes = await request(app)
      .post(`/api/admin/scores/${adjustments[0].id}/reverse`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(reverseRes.status, 200);
    assert.equal(reverseRes.body.evaluation.finalScore, 0);
    assert.ok(reverseRes.body.adjustment.reversedAt);
  });
});

describe('Participant list endpoints', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('GET /participants returns participants without nested arrays', async () => {
    const { token } = await adminToken();
    const app = await getApp();
    await seedParticipant({ email: 'list1@test.com' });

    const res = await request(app)
      .get('/api/admin/participants')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const p = res.body.find((x: any) => x.email === 'list1@test.com');
    assert.ok(p, 'participant should be in the list');
    assert.equal(p.submissions, undefined, 'submissions should not be embedded');
    assert.equal(p.evaluations, undefined, 'evaluations should not be embedded');
  });

  test('GET /participants/:id/submissions returns submissions separately', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant({ email: 'subs@test.com' });
    const app = await getApp();

    const res = await request(app)
      .get(`/api/admin/participants/${participant.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('GET /participants/:id/evaluation returns evaluation separately', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant({ email: 'eval@test.com' });
    await prisma.evaluation.create({ data: { participantId: participant.id, finalScore: 42 } });
    const app = await getApp();

    const res = await request(app)
      .get(`/api/admin/participants/${participant.id}/evaluation`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.finalScore, 42);
  });
});

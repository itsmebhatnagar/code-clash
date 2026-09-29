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

describe('Automated rulebook scoring', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('awards full, proportional partial, and zero points', async () => {
    const { calculateProblemPoints } = await import('../src/services/scoringService');
    assert.equal(calculateProblemPoints(100, 'ACCEPTED', 4, 4), 100);
    assert.equal(calculateProblemPoints(100, 'PARTIAL', 2, 4), 50);
    assert.equal(calculateProblemPoints(100, 'WRONG_ANSWER', 0, 4), 0);
    assert.equal(calculateProblemPoints(100, 'PARTIAL', 0, 4), 0);
  });

  test('aggregates each best problem result across both rounds and fastest-time tie-break', async () => {
    const { recordSubmissionScore } = await import('../src/services/scoringService');
    const participant = await seedParticipant();
    const roundStartedAt = new Date(1_000_000);
    const run = await prisma.round.create({ data: { name: 'Code Run', roundType: 'CODE_RUN', duration: 60, status: 'ENDED', startTime: roundStartedAt } });
    const dark = await prisma.round.create({ data: { name: 'Code in the Dark', roundType: 'CODE_IN_DARK', duration: 60, readingPeriodSeconds: 180, status: 'ENDED', startTime: roundStartedAt } });
    const runPartial = await prisma.problem.create({ data: { title: 'Partial', description: '', inputFormat: '', outputFormat: '', constraints: '', difficulty: 'EASY', timeLimit: 1000, memoryLimit: 128, points: 100, roundId: run.id } });
    const runFull = await prisma.problem.create({ data: { title: 'Full', description: '', inputFormat: '', outputFormat: '', constraints: '', difficulty: 'EASY', timeLimit: 1000, memoryLimit: 128, points: 200, roundId: run.id } });
    const darkFull = await prisma.problem.create({ data: { title: 'Blind', description: '', inputFormat: '', outputFormat: '', constraints: '', difficulty: 'EASY', timeLimit: 1000, memoryLimit: 128, points: 150, roundId: dark.id } });

    const partialAttempts = await Promise.all([700, 450].map((elapsedMs) => prisma.submission.create({
      data: { participantId: participant.id, problemId: runPartial.id, language: 'c', sourceCode: '', status: 'PARTIAL', passedCases: 2, totalCases: 4, executionTime: 1000, createdAt: new Date(roundStartedAt.getTime() + elapsedMs) },
    })));
    await prisma.submission.create({ data: { participantId: participant.id, problemId: runFull.id, language: 'cpp', sourceCode: '', status: 'ACCEPTED', passedCases: 4, totalCases: 4, executionTime: 1000, createdAt: new Date(roundStartedAt.getTime() + 800) } });
    const darkSubmission = await prisma.submission.create({ data: { participantId: participant.id, problemId: darkFull.id, language: 'java', sourceCode: '', status: 'ACCEPTED', passedCases: 3, totalCases: 3, executionTime: 1000, createdAt: new Date(roundStartedAt.getTime() + 181_000) } });

    await recordSubmissionScore(darkSubmission.id);

    const evaluation = await prisma.evaluation.findUnique({ where: { participantId: participant.id } });
    assert.equal(evaluation?.round1Score, 250);
    assert.equal(evaluation?.round2Score, 150);
    assert.equal(evaluation?.tieBreakTimeMs, 2250);
    assert.equal(evaluation?.finalScore, 400);
    assert.equal(partialAttempts.length, 2);
  });
});

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
    await prisma.evaluation.create({ data: { participantId: participant.id, round1Score: 80, round2Score: 60 } });

    const res = await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        participantId:    participant.id,
        manualAdjustments: 5,
        reason:           'Awarded bonus',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.round1Score, 80);
    assert.equal(res.body.round2Score, 60);
    assert.equal(res.body.finalScore,  145);
  });

  test('does not add subjective judge scores to rulebook totals', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    const judgeRes = await request(app)
      .put(`/api/admin/evaluations/${participant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ codeQuality: 40, logicClarity: 30 });

    assert.equal(judgeRes.status, 200);
    assert.equal(judgeRes.body.finalScore, 0);

    const adjustRes = await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ participantId: participant.id, round1Score: 80, round2Score: 60, manualAdjustments: 5, reason: 'Round scores' });

    assert.equal(adjustRes.body.finalScore, 5);

    const adjustment = await prisma.scoreAdjustment.findFirst({ where: { participantId: participant.id } });
    assert.ok(adjustment);
    const reverseRes = await request(app)
      .post(`/api/admin/scores/${adjustment.id}/reverse`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(reverseRes.body.evaluation.finalScore, 0);
    assert.equal(reverseRes.body.evaluation.codeQuality, 40);
    assert.equal(reverseRes.body.evaluation.logicClarity, 30);
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

  test('reverses manual adjustment and restores previous score state instead of zeroing', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    // Participant has initial scores: Round 1 = 40, Round 2 = 35
    await prisma.evaluation.create({
      data: {
        participantId: participant.id,
        round1Score: 40,
        round2Score: 35,
        manualAdjustments: 0,
        finalScore: 75,
      },
    });

    // Admin applies manual adjustment: +5
    const adjustRes = await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        participantId: participant.id,
        round1Score: 40,
        round2Score: 35,
        manualAdjustments: 5,
        reason: 'Bonus points for code elegance',
      });

    assert.equal(adjustRes.status, 200);
    assert.equal(adjustRes.body.finalScore, 80);

    const adjustments = await prisma.scoreAdjustment.findMany({ where: { participantId: participant.id } });
    assert.equal(adjustments.length, 1);

    // Reversing the manual adjustment should restore score to 75, NOT 0
    const reverseRes = await request(app)
      .post(`/api/admin/scores/${adjustments[0].id}/reverse`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(reverseRes.status, 200);
    assert.equal(reverseRes.body.evaluation.round1Score, 40);
    assert.equal(reverseRes.body.evaluation.round2Score, 35);
    assert.equal(reverseRes.body.evaluation.manualAdjustments, 0);
    assert.equal(reverseRes.body.evaluation.finalScore, 75);
    assert.ok(reverseRes.body.adjustment.reversedAt);

    // Verify persisted DB evaluation
    const updatedEval = await prisma.evaluation.findUnique({ where: { participantId: participant.id } });
    assert.equal(updatedEval?.round1Score, 40);
    assert.equal(updatedEval?.round2Score, 35);
    assert.equal(updatedEval?.manualAdjustments, 0);
    assert.equal(updatedEval?.finalScore, 75);
  });

  test('reverses score adjustment when multiple adjustments exist restoring latest active', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    await prisma.evaluation.create({ data: { participantId: participant.id, round1Score: 40, round2Score: 35, finalScore: 75 } });

    // First adjustment preserves the earned round totals -> 75
    await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ participantId: participant.id, manualAdjustments: 0, reason: 'Round scores' });

    // Second adjustment adds only a manual bonus -> 80
    await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ participantId: participant.id, manualAdjustments: 5, reason: 'Manual +5' });

    const adjustments = await prisma.scoreAdjustment.findMany({
      where: { participantId: participant.id },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(adjustments.length, 2);

    // Reverse second adjustment -> should restore to first adjustment state (75)
    const reverseRes = await request(app)
      .post(`/api/admin/scores/${adjustments[1].id}/reverse`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(reverseRes.status, 200);
    assert.equal(reverseRes.body.evaluation.round1Score, 40);
    assert.equal(reverseRes.body.evaluation.round2Score, 35);
    assert.equal(reverseRes.body.evaluation.manualAdjustments, 0);
    assert.equal(reverseRes.body.evaluation.finalScore, 75);
  });

  test('rejects reversal when evaluation is locked', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant();
    const app = await getApp();

    await request(app)
      .post('/api/admin/scores/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ participantId: participant.id, round1Score: 50, round2Score: 50, manualAdjustments: 0, reason: 'Initial' });

    const adjustment = await prisma.scoreAdjustment.findFirst({ where: { participantId: participant.id } });
    assert.ok(adjustment);

    // Lock evaluation
    await prisma.evaluation.update({
      where: { participantId: participant.id },
      data: { lockedAt: new Date() },
    });

    const reverseRes = await request(app)
      .post(`/api/admin/scores/${adjustment.id}/reverse`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(reverseRes.status, 409);
    assert.match(reverseRes.body.error, /locked/i);
  });
});

describe('Round and problem setup', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('creates one question in each of the two rulebook rounds', async () => {
    const { token } = await adminToken();
    const app = await getApp();
    const createdRounds = [];

    for (const [index, roundType] of ['CODE_RUN', 'CODE_IN_DARK'].entries()) {
      const name = index === 0 ? 'Code Run' : 'Code in the Dark';
      const roundRes = await request(app)
        .post('/api/admin/rounds')
        .set('Authorization', `Bearer ${token}`)
        .send({ roundType, duration: 60, readingPeriodSeconds: 180 });
      assert.equal(roundRes.status, 201);
      createdRounds.push(roundRes.body);

      const problemRes = await request(app)
        .post('/api/admin/problems')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: `${name} question`,
          description: 'Solve the round problem.',
          inputFormat: 'One line',
          outputFormat: 'One line',
          constraints: 'None',
          difficulty: 'EASY',
          timeLimit: 1000,
          memoryLimit: 128,
          points: 150 + index * 50,
          roundId: roundRes.body.id,
        });

      assert.equal(problemRes.status, 201);
      assert.equal(problemRes.body.roundId, roundRes.body.id);
      assert.equal(problemRes.body.points, 150 + index * 50);
    }

    const duplicateRoundRes = await request(app)
      .post('/api/admin/rounds')
      .set('Authorization', `Bearer ${token}`)
      .send({ roundType: 'CODE_RUN', duration: 60 });
    assert.equal(duplicateRoundRes.status, 409);

    const roundsRes = await request(app)
      .get('/api/admin/rounds')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(roundsRes.body.length, 2);
    assert.deepEqual(roundsRes.body.map((round: { roundType: string; problems: Array<{ points: number }> }) => ({
      roundType: round.roundType,
      points: round.problems.map((problem) => problem.points),
    })).sort((first: { roundType: string }, second: { roundType: string }) => first.roundType.localeCompare(second.roundType)), [
      { roundType: 'CODE_IN_DARK', points: [200] },
      { roundType: 'CODE_RUN', points: [150] },
    ]);
  });
});

describe('Leaderboard', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('returns participants in descending final-score order', async () => {
    const faster = await seedParticipant({ name: 'Fast scorer' });
    const slower = await seedParticipant({ name: 'Slow scorer' });
    const lowerScoring = await seedParticipant({ name: 'Lower scorer' });
    await prisma.evaluation.create({ data: { participantId: faster.id, finalScore: 175, tieBreakTimeMs: 900 } });
    await prisma.evaluation.create({ data: { participantId: slower.id, finalScore: 175, tieBreakTimeMs: 1800 } });
    await prisma.evaluation.create({ data: { participantId: lowerScoring.id, finalScore: 90 } });

    const res = await request(await getApp()).get('/api/leaderboard');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.leaderboard.map((entry: { rank: number; name: string; finalScore: number }) => ({
      rank: entry.rank,
      name: entry.name,
      finalScore: entry.finalScore,
    })), [
      { rank: 1, name: 'Fast scorer', finalScore: 175 },
      { rank: 2, name: 'Slow scorer', finalScore: 175 },
      { rank: 3, name: 'Lower scorer', finalScore: 90 },
    ]);
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

  test('PUT /participants/:id updates participant successfully', async () => {
    const { token } = await adminToken();
    const participant = await seedParticipant({ email: 'update_ok@test.com' });
    const app = await getApp();

    const res = await request(app)
      .put(`/api/admin/participants/${participant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', college: 'New College' });

    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Updated Name');
    assert.equal(res.body.college, 'New College');
  });

  test('PUT /participants/:id returns 404 when target user is an ADMIN (not a PARTICIPANT)', async () => {
    const { admin, token } = await adminToken();
    const app = await getApp();

    const res = await request(app)
      .put(`/api/admin/participants/${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacked Admin' });

    assert.equal(res.status, 404);
    assert.match(res.body.error, /participant not found/i);
  });
});

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  getApp, cleanDb, seedParticipant, seedAdmin,
  signToken, redisMock, prisma, seedRoundWithProblem
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
    assert.equal(calculateProblemPoints(100, 'COMPILE_ERROR', 0, 4), 0);
    assert.equal(calculateProblemPoints(100, 'RUNTIME_ERROR', 3, 4), 0);
    assert.equal(calculateProblemPoints(100, 'TIME_LIMIT_EXCEEDED', 3, 4), 0);
    assert.equal(calculateProblemPoints(100, 'OUTPUT_LIMIT_EXCEEDED', 1, 4), 0);
    assert.equal(calculateProblemPoints(100, 'COMPILATION_TIME_LIMIT_EXCEEDED', 0, 4), 0);
  });

  test('aggregates each best problem result across both rounds and earlier-submission tie-break', async () => {
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

  test('equal scores prefer the earlier valid submission, not execution time', async () => {
    const { recordSubmissionScore } = await import('../src/services/scoringService');
    const participant = await seedParticipant();
    const roundStartedAt = new Date(2_000_000);
    const run = await prisma.round.create({ data: { name: 'Code Run', roundType: 'CODE_RUN', duration: 60, status: 'ENDED', startTime: roundStartedAt } });
    const problem = await prisma.problem.create({ data: { title: 'Same score', description: '', inputFormat: '', outputFormat: '', constraints: '', difficulty: 'EASY', timeLimit: 1000, memoryLimit: 128, points: 100, roundId: run.id } });
    await prisma.submission.create({
      data: { participantId: participant.id, problemId: problem.id, language: 'python', sourceCode: '', status: 'PARTIAL', passedCases: 2, totalCases: 4, executionTime: 50, createdAt: new Date(roundStartedAt.getTime() + 900) },
    });
    const later = await prisma.submission.create({
      data: { participantId: participant.id, problemId: problem.id, language: 'python', sourceCode: '', status: 'PARTIAL', passedCases: 2, totalCases: 4, executionTime: 5, createdAt: new Date(roundStartedAt.getTime() + 1_500) },
    });
    await recordSubmissionScore(later.id);
    const evaluation = await prisma.evaluation.findUnique({ where: { participantId: participant.id } });
    assert.equal(evaluation?.round1Score, 50);
    assert.equal(evaluation?.tieBreakTimeMs, 900);
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

  test('creates each supported round with a coding problem', async () => {
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

describe('Coding problem administration', { concurrency: false }, async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  test('reports readiness only after a complete problem, example, and hidden test case exist', async () => {
    const { token } = await adminToken();
    const app = await getApp();
    const roundResponse = await request(app).post('/api/admin/rounds').set('Authorization', `Bearer ${token}`).send({ roundType: 'CODE_RUN', duration: 60, readingPeriodSeconds: 0, autoSubmitOnEnd: true });
    assert.equal(roundResponse.status, 201);

    const problemResponse = await request(app).post('/api/admin/problems').set('Authorization', `Bearer ${token}`).send({
      title: 'Sum of Array', description: 'Read N integers and print their sum.', inputFormat: 'N followed by N integers',
      outputFormat: 'One integer', constraints: '1 <= N <= 1000', difficulty: 'EASY', timeLimit: 1000,
      memoryLimit: 256, points: 100, roundId: roundResponse.body.id,
    });
    assert.equal(problemResponse.status, 201);

    const example = await request(app).post(`/api/admin/problems/${problemResponse.body.id}/examples`).set('Authorization', `Bearer ${token}`).send({ input: '3\n1 2 3', output: '6' });
    assert.equal(example.status, 201);
    const testCase = await request(app).post(`/api/admin/problems/${problemResponse.body.id}/test-cases`).set('Authorization', `Bearer ${token}`).send({ input: '2\n4 5', output: '9' });
    assert.equal(testCase.status, 201);
    assert.equal(testCase.body.isHidden, true);

    const rounds = await request(app).get('/api/admin/rounds').set('Authorization', `Bearer ${token}`);
    const readyRound = rounds.body.find((round: { id: string }) => round.id === roundResponse.body.id);
    assert.equal(readyRound.readiness.ready, true);
    assert.equal(readyRound.problems[0].exampleCount, 1);
    assert.equal(readyRound.problems[0].hiddenTestCaseCount, 1);
  });

  test('duplicating a problem copies points, limits, examples, and hidden test cases', async () => {
    const { token } = await adminToken();
    const app = await getApp();
    const round = await prisma.round.create({ data: { name: 'Duplicate Target', roundType: 'CODE_RUN', duration: 60 } });
    const source = await prisma.problem.create({
      data: {
        title: 'Original', description: 'Desc', inputFormat: 'In', outputFormat: 'Out', constraints: 'N>=1',
        difficulty: 'HARD', timeLimit: 2500, memoryLimit: 512, points: 250, roundId: round.id,
        examples: { create: [{ input: '1', output: '2', explanation: 'plus one', position: 0 }] },
        testCases: { create: [{ input: '3', output: '4', isHidden: true }, { input: '5', output: '6', isHidden: false }] },
      },
    });
    const copyResponse = await request(app).post(`/api/admin/problems/${source.id}/duplicate`).set('Authorization', `Bearer ${token}`).send({ roundId: round.id });
    assert.equal(copyResponse.status, 201, JSON.stringify(copyResponse.body));
    assert.equal(copyResponse.body.points, 250);
    assert.equal(copyResponse.body.timeLimit, 2500);
    assert.equal(copyResponse.body.memoryLimit, 512);
    assert.equal(copyResponse.body.difficulty, 'HARD');
    const details = await request(app).get(`/api/admin/problems/${copyResponse.body.id}`).set('Authorization', `Bearer ${token}`);
    assert.equal(details.body.points, 250);
    assert.equal(details.body.examples.length, 1);
    assert.equal(details.body.testCases.length, 2);
    assert.deepEqual(details.body.testCases.map((testCase: { isHidden: boolean }) => testCase.isHidden).sort(), [false, true]);
  });

  test('Code in the Dark readiness requires Code Run to finish first', async () => {
    await cleanDb();
    const { token } = await adminToken();
    const codeRun = await prisma.round.create({ data: { name: 'Code Run', roundType: 'CODE_RUN', duration: 60 } });
    const codeInDark = await prisma.round.create({ data: { name: 'Code in the Dark', roundType: 'CODE_IN_DARK', duration: 60, readingPeriodSeconds: 180 } });
    const app = await getApp();

    const pendingRounds = await request(app).get('/api/admin/rounds').set('Authorization', `Bearer ${token}`);
    const pendingDark = pendingRounds.body.find((round: { id: string }) => round.id === codeInDark.id);
    assert.ok(pendingDark.readiness.missing.includes('round-order'));

    await prisma.round.update({ where: { id: codeRun.id }, data: { status: 'ENDED' } });
    const completedRounds = await request(app).get('/api/admin/rounds').set('Authorization', `Bearer ${token}`);
    const readyForDark = completedRounds.body.find((round: { id: string }) => round.id === codeInDark.id);
    assert.equal(readyForDark.readiness.missing.includes('round-order'), false);
  });

  test('supports editing and deleting examples and test cases only while pending', async () => {
    const { token } = await adminToken();
    const app = await getApp();
    const { round, problem } = await seedRoundWithProblem('PENDING');
    const exampleResponse = await request(app).post(`/api/admin/problems/${problem.id}/examples`).set('Authorization', `Bearer ${token}`).send({ input: '1', output: '1' });
    const testCaseResponse = await request(app).post(`/api/admin/problems/${problem.id}/test-cases`).set('Authorization', `Bearer ${token}`).send({ input: '2', output: '2' });

    const updateExampleResponse = await request(app).put(`/api/admin/problems/${problem.id}/examples/${exampleResponse.body.id}`).set('Authorization', `Bearer ${token}`).send({ output: 'updated' });
    assert.equal(updateExampleResponse.status, 200);
    assert.equal(updateExampleResponse.body.output, 'updated');
    const duplicateTestCaseResponse = await request(app).post(`/api/admin/problems/${problem.id}/test-cases/${testCaseResponse.body.id}/duplicate`).set('Authorization', `Bearer ${token}`);
    assert.equal(duplicateTestCaseResponse.status, 201);
    assert.equal(duplicateTestCaseResponse.body.isHidden, true);

    const deleteExampleResponse = await request(app).delete(`/api/admin/problems/${problem.id}/examples/${exampleResponse.body.id}`).set('Authorization', `Bearer ${token}`);
    assert.equal(deleteExampleResponse.status, 204);
    const deleteTestCaseResponse = await request(app).delete(`/api/admin/problems/${problem.id}/test-cases/${testCaseResponse.body.id}`).set('Authorization', `Bearer ${token}`);
    assert.equal(deleteTestCaseResponse.status, 204);

    const lockedExample = await request(app).post(`/api/admin/problems/${problem.id}/examples`).set('Authorization', `Bearer ${token}`).send({ input: '3', output: '3' });
    await prisma.round.update({ where: { id: round.id }, data: { status: 'ACTIVE' } });
    const locked = await request(app).put(`/api/admin/problems/${problem.id}/examples/${lockedExample.body.id}`).set('Authorization', `Bearer ${token}`).send({ output: 'blocked' });
    assert.equal(locked.status, 409);
    const addLockedCase = await request(app).post(`/api/admin/problems/${problem.id}/test-cases`).set('Authorization', `Bearer ${token}`).send({ input: '', output: 'blocked' });
    assert.equal(addLockedCase.status, 409);
  });

  test('duplicates every problem property, example, points value, and hidden state', async () => {
    await cleanDb();
    const { token } = await adminToken();
    const app = await getApp();
    const round = await prisma.round.create({ data: { name: 'Copy Source', roundType: 'CODE_RUN', duration: 60 } });
    const problem = await prisma.problem.create({ data: {
      title: 'Original', description: 'Statement', inputFormat: 'Input', outputFormat: 'Output', constraints: 'N <= 10',
      difficulty: 'HARD', timeLimit: 2500, memoryLimit: 512, points: 275, roundId: round.id,
      examples: { create: [{ input: '1', output: '1', explanation: 'public', position: 0 }] },
      testCases: { create: [{ input: 'hidden input', output: 'hidden output', isHidden: true }, { input: 'public input', output: 'public output', isHidden: false }] },
    } });

    const response = await request(app).post(`/api/admin/problems/${problem.id}/duplicate`).set('Authorization', `Bearer ${token}`).send();

    assert.equal(response.status, 201);
    const copy = await prisma.problem.findUnique({ where: { id: response.body.id }, include: { examples: true, testCases: true } });
    assert.equal(copy?.title, 'Original (Copy)');
    assert.equal(copy?.description, 'Statement');
    assert.equal(copy?.inputFormat, 'Input');
    assert.equal(copy?.outputFormat, 'Output');
    assert.equal(copy?.constraints, 'N <= 10');
    assert.equal(copy?.difficulty, 'HARD');
    assert.equal(copy?.timeLimit, 2500);
    assert.equal(copy?.memoryLimit, 512);
    assert.equal(copy?.points, 275);
    assert.deepEqual(copy?.examples.map((example) => [example.input, example.output, example.explanation, example.position]), [['1', '1', 'public', 0]]);
    assert.deepEqual(copy?.testCases.map((testCase) => [testCase.input, testCase.output, testCase.isHidden]), [['hidden input', 'hidden output', true], ['public input', 'public output', false]]);
  });

  test('creates and reorders multiple problems in a round, then locks order on start', async () => {
    const { token } = await adminToken();
    const app = await getApp();
    const round = await prisma.round.create({ data: { name: 'Ordered Problems', roundType: 'CODE_RUN', duration: 60 } });
    const createProblem = (title: string) => request(app).post('/api/admin/problems').set('Authorization', `Bearer ${token}`).send({
      title, description: 'Complete statement', inputFormat: 'Input', outputFormat: 'Output', constraints: 'N >= 1',
      difficulty: 'EASY', timeLimit: 1000, memoryLimit: 256, points: 100, roundId: round.id,
    });
    const first = await createProblem('First');
    const second = await createProblem('Second');
    const third = await createProblem('Third');
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(third.status, 201);

    const reorder = await request(app).put(`/api/admin/rounds/${round.id}/problems/reorder`).set('Authorization', `Bearer ${token}`).send({ ids: [third.body.id, first.body.id, second.body.id] });
    assert.equal(reorder.status, 204);
    const list = await request(app).get('/api/admin/rounds').set('Authorization', `Bearer ${token}`);
    const orderedRound = list.body.find((item: { id: string }) => item.id === round.id);
    assert.deepEqual(orderedRound.problems.map((problem: { title: string }) => problem.title), ['Third', 'First', 'Second']);

    await prisma.round.update({ where: { id: round.id }, data: { status: 'ACTIVE' } });
    const locked = await request(app).put(`/api/admin/rounds/${round.id}/problems/reorder`).set('Authorization', `Bearer ${token}`).send({ ids: [first.body.id, second.body.id, third.body.id] });
    assert.equal(locked.status, 409);
  });

  test('bulk import supports several problems in one round and rolls back invalid batches', async () => {
    const { token } = await adminToken();
    const app = await getApp();
    const round = await prisma.round.create({ data: { name: 'Multi-problem Run', roundType: 'CODE_RUN', duration: 60, readingPeriodSeconds: 0 } });
    const problemFor = (roundId: string, title: string) => ({
      roundId, title, description: 'A complete statement.', inputFormat: 'Input', outputFormat: 'Output', constraints: 'N >= 1', difficulty: 'MEDIUM', timeLimit: 1000, memoryLimit: 256, points: 100,
      examples: [{ input: '1', output: '1' }], testCases: [{ input: '1', output: '1', isHidden: true }],
    });
    const response = await request(app).post('/api/admin/problems/import').set('Authorization', `Bearer ${token}`).send({ problems: [problemFor(round.id, 'Imported One'), problemFor(round.id, 'Imported Two')] });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.length, 2);
    assert.equal(response.body[0].points, 100);
    assert.deepEqual(response.body.map((problem: { position: number }) => problem.position), [0, 1]);

    const invalidProblem = { ...problemFor(round.id, 'Invalid Later Item'), timeLimit: -1 };
    const invalid = await request(app).post('/api/admin/problems/import').set('Authorization', `Bearer ${token}`).send({ problems: [problemFor(round.id, 'Would Be Partial'), invalidProblem] });
    assert.equal(invalid.status, 400);
    assert.equal(await prisma.problem.count({ where: { roundId: round.id } }), 2);
  });
});

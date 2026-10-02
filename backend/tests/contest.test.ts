import test, { before, beforeEach, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  getApp, cleanDb, seedParticipant, seedRoundWithProblem, signToken, prisma
} from './helpers';
import { getRoundPhase, getRoundReadiness } from '../src/services/contestService';

describe('Round phases', () => {
  test('Code Run starts in coding immediately', () => {
    assert.equal(getRoundPhase({ roundType: 'CODE_RUN', readingPeriodSeconds: 0, startTime: new Date() }), 'CODING');
  });

  test('Code in the Dark reveals coding only after its reading period', () => {
    const startTime = new Date(1_000_000);
    const round = { roundType: 'CODE_IN_DARK', readingPeriodSeconds: 180, startTime };
    assert.equal(getRoundPhase(round, startTime.getTime() + 179_999), 'READING');
    assert.equal(getRoundPhase(round, startTime.getTime() + 180_000), 'CODING');
  });

  test('round readiness requires at least one complete coding problem and hidden judge coverage', () => {
    const round = {
      status: 'PENDING', roundType: 'CODE_RUN', duration: 60, readingPeriodSeconds: 0,
      problems: [{
        title: 'Sum of Array', description: 'Read values and sum them.', inputFormat: 'N followed by values',
        outputFormat: 'One integer', constraints: '1 <= N <= 1000', difficulty: 'EASY',
        timeLimit: 1000, memoryLimit: 256, points: 100, examples: [{ id: 'example' }],
        testCases: [{ isHidden: false }, { isHidden: true }],
      }],
    };
    assert.equal(getRoundReadiness(round).ready, true);
    assert.equal(getRoundReadiness({ ...round, problems: [round.problems[0], { ...round.problems[0], title: 'Second Problem' }] }).ready, true);
    assert.equal(getRoundReadiness({ ...round, problems: [round.problems[0], { ...round.problems[0], title: 'Binary Search' }] }).ready, true);
    assert.equal(getRoundReadiness({ ...round, problems: [{ ...round.problems[0], testCases: [{ isHidden: false }] }] }).missing.includes('problem-1-hidden-test-cases'), true);
    assert.equal(getRoundReadiness({ ...round, problems: [] }).missing.includes('problems'), true);
    assert.equal(getRoundReadiness({ ...round, problems: [round.problems[0], { ...round.problems[0], description: '' }] }).missing.includes('problem-2-description'), true);
  });
});

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

  test('blocks Code in the Dark submissions until reading ends', async () => {
    const { round, problem } = await seedRoundWithProblem('ACTIVE');
    await prisma.round.update({ where: { id: round.id }, data: { roundType: 'CODE_IN_DARK', readingPeriodSeconds: 180, startTime: new Date() } });
    const participant = await seedParticipant({ status: 'CHECKED_IN' });
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });
    const payload = { problemId: problem.id, roundId: round.id, language: 'python', sourceCode: 'print("hello")' };

    const readingResponse = await request(app).post('/api/contest/submit').set('Authorization', `Bearer ${token}`).send(payload);
    assert.equal(readingResponse.status, 409);
    assert.match(readingResponse.body.error, /reading period/i);

    await prisma.round.update({ where: { id: round.id }, data: { startTime: new Date(Date.now() - 181_000) } });
    const codingResponse = await request(app).post('/api/contest/submit').set('Authorization', `Bearer ${token}`).send(payload);
    assert.equal(codingResponse.status, 202);
  });

  test('rejects submission when round has ended (endTime passed)', async () => {
    const round = await prisma.round.create({
      data: { 
        name: `Round-${Date.now()}`, 
        duration: 60, 
        status: 'ACTIVE',
        startTime: new Date(Date.now() - 120_000),
        endTime: new Date(Date.now() - 60_000)
      },
    });
    const problem = await prisma.problem.create({
      data: {
        title:        'Hello World',
        description:  'Print hello',
        inputFormat:  'None',
        outputFormat: '"hello"',
        constraints:  'None',
        difficulty:   'EASY',
        timeLimit:    2000,
        memoryLimit:  128,
        roundId:      round.id,
      },
    });
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app)
      .post('/api/contest/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem.id, roundId: round.id, language: 'python', sourceCode: 'print("hello")' });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /ended/i);
  });
});

describe('GET /api/contest/dashboard', { concurrency: false }, async () => {
  before(async () => { await cleanDb(); });
  beforeEach(async () => { await cleanDb(); });
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
    assert.equal(res.body.round.phase, 'CODING');
    assert.equal(res.body.stats.solved, 0);
    assert.equal(res.body.stats.attempted, 0);
  });

  test('returns public examples but never judge test case payloads', async () => {
    const { round, problem } = await seedRoundWithProblem('ACTIVE');
    await prisma.problemExample.create({ data: { problemId: problem.id, input: '2', output: '3', explanation: 'Example' } });
    await prisma.testCase.create({ data: { problemId: problem.id, input: 'secret input', output: 'secret answer', isHidden: true } });
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app).get('/api/contest/dashboard').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.round.id, round.id);
    assert.deepEqual(res.body.round.problems[0].examples.map((example: { input: string }) => example.input), ['2']);
    assert.equal(res.body.round.problems[0].testCases, undefined);
    assert.equal(JSON.stringify(res.body).includes('secret answer'), false);
  });

  test('returns all round problems in configured order', async () => {
    const { round, problem: secondProblem } = await seedRoundWithProblem('ACTIVE');
    await prisma.problem.update({ where: { id: secondProblem.id }, data: { position: 1 } });
    const firstProblem = await prisma.problem.create({
      data: {
        title: 'First Problem', description: 'First statement', inputFormat: 'Input', outputFormat: 'Output', constraints: 'N >= 1',
        difficulty: 'EASY', timeLimit: 1000, memoryLimit: 256, points: 150, roundId: round.id, position: 0,
        examples: { create: { input: '1', output: '1', position: 0 } },
        testCases: { create: { input: 'secret', output: 'not public', isHidden: true } },
      },
    });
    const participant = await seedParticipant();
    const app = await getApp();
    const token = signToken({ id: participant.id, role: 'PARTICIPANT' });

    const res = await request(app).get('/api/contest/dashboard').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.round.problems.map((problem: { id: string }) => problem.id), [firstProblem.id, secondProblem.id]);
    assert.equal(res.body.round.problems[0].examples[0].input, '1');
    assert.equal(res.body.round.problems[0].testCases, undefined);
    assert.equal(JSON.stringify(res.body).includes('not public'), false);
  });
});

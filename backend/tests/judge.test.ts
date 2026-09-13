/**
 * tests/judge.test.ts
 * Judge worker – unit tests for all verdicts using normalizeLanguage and normalizeOutput
 * plus integration-style tests for the judgeSubmission logic via a mocked Docker environment.
 *
 * IMPORTANT: helpers must be imported FIRST so DATABASE_URL is set before
 * src/judgeWorker (and therefore src/db) is loaded.
 */
// 1. helpers sets process.env.DATABASE_URL before any src/* module is required
import { cleanDb, prisma, seedParticipant, seedRoundWithProblem } from './helpers';
// 2. judgeWorker loads src/db.ts which reads DATABASE_URL — must be after helpers
import { normalizeLanguage, normalizeOutput } from '../src/judgeWorker';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── Pure-function unit tests ────────────────────────────────────────────────────

describe('normalizeLanguage', () => {
  test('recognises javascript aliases', () => {
    assert.equal(normalizeLanguage('JS'), 'javascript');
    assert.equal(normalizeLanguage('javascript'), 'javascript');
    assert.equal(normalizeLanguage('node'), 'javascript');
  });

  test('recognises python aliases', () => {
    assert.equal(normalizeLanguage('python'), 'python');
    assert.equal(normalizeLanguage('Python3'), 'python');
  });

  test('recognises cpp aliases', () => {
    assert.equal(normalizeLanguage('cpp'), 'cpp');
    assert.equal(normalizeLanguage('c++'), 'cpp');
    assert.equal(normalizeLanguage('C++'), 'cpp');
  });

  test('recognises java', () => {
    assert.equal(normalizeLanguage('java'), 'java');
    assert.equal(normalizeLanguage('JAVA'), 'java');
  });

  test('returns null for unsupported languages', () => {
    assert.equal(normalizeLanguage('ruby'), null);
    assert.equal(normalizeLanguage('go'), null);
    assert.equal(normalizeLanguage(''), null);
  });
});

describe('normalizeOutput', () => {
  test('normalises Windows line endings', () => {
    assert.equal(normalizeOutput('hello\r\nworld\r\n'), 'hello\nworld');
  });

  test('trims trailing whitespace from each line', () => {
    assert.equal(normalizeOutput('answer   \nsecond   '), 'answer\nsecond');
  });

  test('trims leading/trailing blank lines', () => {
    assert.equal(normalizeOutput('\nhello\n'), 'hello');
  });

  test('handles empty output', () => {
    assert.equal(normalizeOutput(''), '');
    assert.equal(normalizeOutput('   '), '');
  });
});

// ── judgeSubmission integration tests (no real Docker) ─────────────────────────

describe('judgeSubmission – verdicts', async () => {
  before(async () => { await cleanDb(); });
  after(async () => { await cleanDb(); });

  /**
   * Helper: create a pending submission in the DB and call judgeSubmission.
   * JUDGE_DOCKER_IMAGE is unset and JUDGE_REQUIRE_SANDBOX is false in test env,
   * so the worker runs on the host (safe for lightweight test cases).
   */
  async function runJudge(options: {
    sourceCode: string;
    language: string;
    input?: string;
    expectedOutput: string;
  }) {
    const { round, problem: rawProblem } = await seedRoundWithProblem('ACTIVE');
    // Replace the auto-created test case with our own
    await prisma.testCase.deleteMany({ where: { problemId: rawProblem.id } });
    await prisma.testCase.create({
      data: { problemId: rawProblem.id, input: options.input ?? '', output: options.expectedOutput, isHidden: false },
    });

    const participant = await seedParticipant();
    const submission = await prisma.submission.create({
      data: {
        participantId: participant.id,
        problemId:     rawProblem.id,
        language:      options.language,
        sourceCode:    options.sourceCode,
        status:        'PENDING',
      },
    });

    const { judgeSubmission } = await import('../src/judgeWorker');
    const result = await judgeSubmission(submission.id);
    return result;
  }

  test('ACCEPTED – correct output', async () => {
    const result = await runJudge({
      language:       'python',
      sourceCode:     'print("hello")',
      expectedOutput: 'hello',
    });
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(result.passedCases, 1);
  });

  test('WRONG_ANSWER – incorrect output', async () => {
    const result = await runJudge({
      language:       'python',
      sourceCode:     'print("wrong")',
      expectedOutput: 'hello',
    });
    assert.equal(result.status, 'WRONG_ANSWER');
    assert.equal(result.passedCases, 0);
  });

  test('TIME_LIMIT_EXCEEDED – infinite loop', async () => {
    const result = await runJudge({
      language:       'python',
      sourceCode:     'while True: pass',
      expectedOutput: 'hello',
    });
    assert.equal(result.status, 'TIME_LIMIT_EXCEEDED');
  });

  test('RUNTIME_ERROR – code that crashes', async () => {
    const result = await runJudge({
      language:       'python',
      sourceCode:     'raise RuntimeError("boom")',
      expectedOutput: 'hello',
    });
    assert.equal(result.status, 'RUNTIME_ERROR');
  });

  test('COMPILE_ERROR – unsupported language returns COMPILE_ERROR', async () => {
    const result = await runJudge({
      language:       'brainfuck',
      sourceCode:     '+++',
      expectedOutput: 'hello',
    });
    assert.equal(result.status, 'COMPILE_ERROR');
  });

  test('COMPILE_ERROR – submission not found throws', async () => {
    const { judgeSubmission } = await import('../src/judgeWorker');
    await assert.rejects(
      () => judgeSubmission('non-existent-id'),
      /Submission not found/
    );
  });

  test('OUTPUT_LIMIT_EXCEEDED – huge output floods the buffer', async () => {
    const result = await runJudge({
      language:       'python',
      // Prints ~300KB which exceeds MAX_OUTPUT_BYTES (256KB)
      sourceCode:     'print("x" * 300_000)',
      expectedOutput: 'something else',
    });
    assert.equal(result.status, 'OUTPUT_LIMIT_EXCEEDED');
  });
});

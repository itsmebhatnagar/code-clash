import { cleanDb, prisma, seedParticipant, seedRoundWithProblem } from './helpers';
import { normalizeLanguage, normalizeOutput } from '../src/judgeWorker';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('normalizeLanguage', () => {
  test('recognises javascript as unsupported', () => {
    assert.equal(normalizeLanguage('JS'), null);
    assert.equal(normalizeLanguage('javascript'), null);
    assert.equal(normalizeLanguage('node'), null);
  });

  test('recognises python aliases', () => {
    assert.equal(normalizeLanguage('python'), 'python');
    assert.equal(normalizeLanguage('Python3'), 'python');
  });

  test('recognises cpp aliases', () => {
    assert.equal(normalizeLanguage('C'), 'c');
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
        problemId: rawProblem.id,
        language: options.language,
        sourceCode: options.sourceCode,
        status: 'PENDING',
        ipAddress: '127.0.0.1',
        deviceFingerprint: 'test-fingerprint',
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
    assert.equal(result.compilationTime, null);
    assert.equal(typeof result.executionTime, 'number');
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

  test('COMPILE_ERROR – submission not found throws InfraError', async () => {
    const { judgeSubmission } = await import('../src/judgeWorker');
    await assert.rejects(
      () => judgeSubmission('non-existent-id'),
      // Now throws InfraError (transient: submission may not have been persisted yet)
      /not found/i
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

  test('PARTIAL – continues after a wrong answer and scores passed/total cases', async () => {
    const result = await runJudgeCases({
      language: 'python',
      sourceCode: 'print(input())',
      cases: [
        { input: '1', output: '1', isHidden: true },
        { input: '2', output: '2', isHidden: true },
        { input: '3', output: 'wrong', isHidden: true },
        { input: '4', output: '4', isHidden: false },
        { input: '5', output: '5', isHidden: true },
      ],
    });
    assert.equal(result.status, 'PARTIAL');
    assert.equal(result.passedCases, 4);
    assert.equal(result.totalCases, 5);
    const { calculateProblemPoints } = await import('../src/services/scoringService');
    assert.equal(calculateProblemPoints(100, result.status, result.passedCases, result.totalCases), 80);
    assert.equal(typeof result.executionTime, 'number');
    assert.equal(typeof result.maxTestCaseExecutionTime, 'number');
  });

  test('RUNTIME_ERROR – still evaluates remaining cases but awards no partial points', async () => {
    const result = await runJudgeCases({
      language: 'python',
      sourceCode: 'value = input().strip()\nif value == "boom":\n    raise RuntimeError("boom")\nprint(value)',
      cases: [
        { input: 'ok', output: 'ok', isHidden: true },
        { input: 'boom', output: 'ok', isHidden: true },
        { input: 'later', output: 'later', isHidden: true },
      ],
    });
    assert.equal(result.status, 'RUNTIME_ERROR');
    assert.equal(result.passedCases, 2);
    assert.equal(result.totalCases, 3);
    const { calculateProblemPoints } = await import('../src/services/scoringService');
    assert.equal(calculateProblemPoints(100, result.status, result.passedCases, result.totalCases), 0);
  });

  test('TIME_LIMIT_EXCEEDED – evaluates remaining cases but awards no partial points', async () => {
    const { problem: rawProblem } = await seedRoundWithProblem('ACTIVE');
    await prisma.testCase.deleteMany({ where: { problemId: rawProblem.id } });
    await prisma.testCase.createMany({
      data: [
        { problemId: rawProblem.id, input: 'ok', output: 'ok', isHidden: true },
        { problemId: rawProblem.id, input: 'loop', output: 'ok', isHidden: true },
        { problemId: rawProblem.id, input: 'later', output: 'later', isHidden: true },
      ],
    });
    const participant = await seedParticipant();
    const submission = await prisma.submission.create({
      data: {
        participantId: participant.id,
        problemId: rawProblem.id,
        language: 'python',
        sourceCode: 'value = input().strip()\nif value == "loop":\n    while True:\n        pass\nprint(value)',
        status: 'PENDING',
        ipAddress: '127.0.0.1',
        deviceFingerprint: 'test-fingerprint',
      },
    });
    const { judgeSubmission } = await import('../src/judgeWorker');
    const result = await judgeSubmission(submission.id);
    assert.equal(result.status, 'TIME_LIMIT_EXCEEDED');
    assert.equal(result.passedCases, 2);
    assert.equal(result.totalCases, 3);
  });

  test('sandbox required without Docker image raises InfraError and leaves the submission unjudged', async () => {
    const { problem } = await seedRoundWithProblem('ACTIVE');
    const participant = await seedParticipant();
    const submission = await prisma.submission.create({
      data: {
        participantId: participant.id,
        problemId: problem.id,
        language: 'python',
        sourceCode: 'print("hello")',
        status: 'PENDING',
        ipAddress: '127.0.0.1',
        deviceFingerprint: 'test-fingerprint',
      },
    });
    const previousRequire = process.env.JUDGE_REQUIRE_SANDBOX;
    const previousImage = process.env.JUDGE_DOCKER_IMAGE;
    process.env.JUDGE_REQUIRE_SANDBOX = 'true';
    delete process.env.JUDGE_DOCKER_IMAGE;
    try {
      const { judgeSubmission, InfraError } = await import('../src/judgeWorker');
      await assert.rejects(() => judgeSubmission(submission.id), InfraError);
      const unchanged = await prisma.submission.findUnique({ where: { id: submission.id } });
      assert.equal(unchanged?.status, 'PENDING');
    } finally {
      process.env.JUDGE_REQUIRE_SANDBOX = previousRequire;
      if (previousImage === undefined) delete process.env.JUDGE_DOCKER_IMAGE;
      else process.env.JUDGE_DOCKER_IMAGE = previousImage;
    }
  });
});

async function runJudgeCases(options: {
  sourceCode: string;
  language: string;
  cases: Array<{ input: string; output: string; isHidden?: boolean }>;
}) {
  const { problem: rawProblem } = await seedRoundWithProblem('ACTIVE');
  await prisma.testCase.deleteMany({ where: { problemId: rawProblem.id } });
  await prisma.testCase.createMany({
    data: options.cases.map((testCase) => ({
      problemId: rawProblem.id,
      input: testCase.input,
      output: testCase.output,
      isHidden: testCase.isHidden ?? true,
    })),
  });
  const participant = await seedParticipant();
  const submission = await prisma.submission.create({
    data: {
      participantId: participant.id,
      problemId: rawProblem.id,
      language: options.language,
      sourceCode: options.sourceCode,
      status: 'PENDING',
      ipAddress: '127.0.0.1',
      deviceFingerprint: 'test-fingerprint',
    },
  });
  const { judgeSubmission } = await import('../src/judgeWorker');
  return judgeSubmission(submission.id);
}

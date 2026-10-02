import { prisma } from '../db';
import { recordAuditLog } from '../audit';
import { AppError } from '../middleware/errorMiddleware';

export async function listWorkstations() {
  return prisma.workstation.findMany({
    include: {
      participant: {
        select: { name: true, email: true },
      },
    },
  });
}

export async function assignWorkstation(pcNumber: string, participantId: string, adminId: string) {
  if (!pcNumber || !participantId) {
    throw new AppError(400, 'pcNumber and participantId are required');
  }

  const workstation = await prisma.$transaction(async (transaction) => {
    const participant = await transaction.user.findUnique({
      where: { id: participantId },
      select: { id: true, role: true },
    });

    if (!participant || participant.role !== 'PARTICIPANT') {
      throw new AppError(404, 'Participant not found');
    }

    await transaction.workstation.deleteMany({ where: { participantId } });
    const assigned = await transaction.workstation.upsert({
      where: { pcNumber },
      update: { participantId },
      create: { pcNumber, participantId },
    });

    await transaction.workstationAssignmentHistory.create({
      data: {
        workstationId: assigned.id,
        pcNumber,
        participantId,
        adminId,
        action: 'ASSIGN',
      },
    });

    return assigned;
  });

  await recordAuditLog(
    adminId,
    'WORKSTATION_ASSIGN',
    `Workstation ${pcNumber} assigned to participant ${participantId}`
  );

  return workstation;
}

export async function releaseWorkstation(id: string, adminId: string) {
  const workstation = await prisma.workstation.findUnique({ where: { id } });
  if (!workstation) throw new AppError(404, 'Workstation not found');

  await prisma.workstation.update({
    where: { id: workstation.id },
    data: { participantId: null },
  });

  await prisma.workstationAssignmentHistory.create({
    data: {
      workstationId: workstation.id,
      pcNumber: workstation.pcNumber,
      participantId: workstation.participantId,
      adminId,
      action: 'RELEASE',
    },
  });
}

export async function getWorkstationHistory(workstationId: string) {
  return prisma.workstationAssignmentHistory.findMany({
    where: { workstationId },
    orderBy: { createdAt: 'desc' },
  });
}

export interface CreateProblemInput {
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  difficulty: string;
  timeLimit: number;
  memoryLimit: number;
  points?: number;
  roundId: string;
}

export type BulkCodingProblemInput = CreateProblemInput & {
  examples: Array<{ input: string; output: string; explanation?: string }>;
  testCases: Array<{ input: string; output: string; isHidden?: boolean }>;
};

const problemTextFields = ['title', 'description', 'inputFormat', 'outputFormat', 'constraints'] as const;

function validateProblemFields(data: Partial<CreateProblemInput>, requireAll = false) {
  for (const field of problemTextFields) {
    const value = data[field];
    if (value === undefined && !requireAll) continue;
    if (typeof value !== 'string' || !value.trim()) throw new AppError(400, `${field} is required`);
  }
  if (requireAll && data.difficulty === undefined) throw new AppError(400, 'difficulty is required');
  if (data.difficulty !== undefined && !['EASY', 'MEDIUM', 'HARD'].includes(data.difficulty)) {
    throw new AppError(400, 'Difficulty must be EASY, MEDIUM, or HARD');
  }
  for (const [field, value, minimum, maximum] of [
    ['timeLimit', data.timeLimit, 1, 60_000],
    ['memoryLimit', data.memoryLimit, 1, 4_096],
    ['points', data.points, 1, 10_000],
  ] as const) {
    if (value === undefined && field === 'points') continue;
    if (value === undefined) {
      if (requireAll) throw new AppError(400, `${field} is required`);
      continue;
    }
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < minimum || numericValue > maximum) {
      throw new AppError(400, `${field} must be a whole number between ${minimum} and ${maximum}`);
    }
  }
}

export const ROUND_TYPES = {
  CODE_RUN: { name: 'Code Run', readingPeriodSeconds: 0 },
  CODE_IN_DARK: { name: 'Code in the Dark', readingPeriodSeconds: 180 },
} as const;

export type RoundType = keyof typeof ROUND_TYPES;

export function getRoundPhase(round: { roundType: string; readingPeriodSeconds: number; startTime: Date | null }, now = Date.now()) {
  if (round.roundType === 'CODE_IN_DARK' && round.startTime
    && now < round.startTime.getTime() + round.readingPeriodSeconds * 1000) return 'READING' as const;
  return 'CODING' as const;
}

export function getRoundEndDelayMs(durationMinutes: number, readingPeriodSeconds: number) {
  return durationMinutes * 60_000 + readingPeriodSeconds * 1000;
}

export type RoundReadiness = {
  ready: boolean;
  checks: Array<{ key: string; label: string; ready: boolean }>;
  missing: string[];
};

export function getRoundReadiness(round: {
  status: string;
  roundType: string;
  duration: number;
  readingPeriodSeconds: number;
  problems: Array<{
    title: string;
    description: string;
    inputFormat: string;
    outputFormat: string;
    constraints: string;
    difficulty: string;
    timeLimit: number;
    memoryLimit: number;
    points: number;
    examples: Array<{ id: string }>;
    testCases: Array<{ isHidden: boolean }>;
  }>;
}): RoundReadiness {
  const checks = [
    { key: 'round-type', label: 'Round type configured', ready: round.roundType === 'CODE_RUN' || round.roundType === 'CODE_IN_DARK' },
    { key: 'duration', label: 'Duration configured', ready: Number.isInteger(round.duration) && round.duration > 0 },
    { key: 'reading-period', label: 'Reading period configured', ready: round.roundType === 'CODE_RUN' ? round.readingPeriodSeconds === 0 : Number.isInteger(round.readingPeriodSeconds) && round.readingPeriodSeconds >= 30 && round.readingPeriodSeconds <= 600 },
    { key: 'problems', label: 'At least one coding problem configured', ready: round.problems.length >= 1 },
  ];
  round.problems.forEach((problem, index) => {
    const prefix = `problem-${index + 1}`;
    const label = `Problem ${index + 1}`;
    checks.push(
      { key: `${prefix}-title`, label: `${label}: title configured`, ready: Boolean(problem.title.trim()) },
      { key: `${prefix}-description`, label: `${label}: statement complete`, ready: Boolean(problem.description.trim()) },
      { key: `${prefix}-input-format`, label: `${label}: input format configured`, ready: Boolean(problem.inputFormat.trim()) },
      { key: `${prefix}-output-format`, label: `${label}: output format configured`, ready: Boolean(problem.outputFormat.trim()) },
      { key: `${prefix}-constraints`, label: `${label}: constraints configured`, ready: Boolean(problem.constraints.trim()) },
      { key: `${prefix}-difficulty`, label: `${label}: difficulty configured`, ready: ['EASY', 'MEDIUM', 'HARD'].includes(problem.difficulty) },
      { key: `${prefix}-time-limit`, label: `${label}: time limit configured`, ready: Number.isInteger(problem.timeLimit) && problem.timeLimit >= 1 && problem.timeLimit <= 60_000 },
      { key: `${prefix}-memory-limit`, label: `${label}: memory limit configured`, ready: Number.isInteger(problem.memoryLimit) && problem.memoryLimit >= 1 && problem.memoryLimit <= 4_096 },
      { key: `${prefix}-points`, label: `${label}: points configured`, ready: Number.isInteger(problem.points) && problem.points > 0 && problem.points <= 10_000 },
      { key: `${prefix}-examples`, label: `${label}: public example configured`, ready: problem.examples.length > 0 },
      { key: `${prefix}-test-cases`, label: `${label}: judge test cases configured`, ready: problem.testCases.length > 0 },
      { key: `${prefix}-hidden-test-cases`, label: `${label}: hidden judge test case available`, ready: problem.testCases.some((testCase) => testCase.isHidden) },
    );
  });
  const missing = checks.filter((check) => !check.ready).map((check) => check.key);
  return { ready: missing.length === 0, checks, missing };
}

async function assertProblemEditable(problemId: string) {
  const problem = await prisma.problem.findUnique({ where: { id: problemId }, select: { round: { select: { status: true } } } });
  if (!problem) throw new AppError(404, 'Problem not found');
  if (problem.round.status !== 'PENDING') throw new AppError(409, 'Questions can only be changed before their round starts');
}

export async function listProblems() {
  const problems = await prisma.problem.findMany({
    include: { round: true, examples: { orderBy: [{ position: 'asc' }, { id: 'asc' }] }, _count: { select: { testCases: true } } },
    orderBy: [{ roundId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
  });
  return problems.map(({ _count, ...problem }) => ({
    ...problem,
    exampleCount: problem.examples.length,
    testCaseCount: _count.testCases,
  }));
}

export async function getProblemById(id: string) {
  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      round: true,
      examples: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
      testCases: true,
      _count: { select: { testCases: true } },
    },
  });
  if (!problem) throw new AppError(404, 'Problem not found');
  const { _count, ...details } = problem;
  return { ...details, exampleCount: details.examples.length, testCaseCount: _count.testCases };
}

export async function createProblem(data: CreateProblemInput, adminId: string) {
  if (typeof data.roundId !== 'string' || !data.roundId.trim()) throw new AppError(400, 'roundId is required');
  validateProblemFields(data, true);
  const round = await prisma.round.findUnique({ where: { id: data.roundId }, select: { status: true, roundType: true } });
  if (!round) throw new AppError(404, 'Round not found');
  if (round.status !== 'PENDING') throw new AppError(409, 'Problems can only be added to pending rounds');
  const lastProblem = await prisma.problem.aggregate({ where: { roundId: data.roundId }, _max: { position: true } });
  const problem = await prisma.problem.create({ data: { ...data, position: (lastProblem._max.position ?? -1) + 1, timeLimit: Number(data.timeLimit), memoryLimit: Number(data.memoryLimit), points: Number(data.points ?? 100) } });
  await recordAuditLog(
    adminId,
    'PROBLEM_CREATE',
    `Problem ${problem.id} (${problem.title}) created for round ${data.roundId}`
  );
  return problem;
}

export async function bulkImportProblems(input: unknown, adminId: string) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new AppError(400, 'Import at least one coding problem');
  }
  const problems: BulkCodingProblemInput[] = input.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'Each imported problem must be an object');
    const problem = value as Record<string, unknown>;
    validateProblemFields(problem as Partial<CreateProblemInput>, true);
    if (typeof problem.roundId !== 'string' || !problem.roundId.trim()) throw new AppError(400, 'Each imported problem needs a pending roundId');
    if (!Array.isArray(problem.examples) || !problem.examples.length) throw new AppError(400, `Problem "${String(problem.title)}" needs at least one public example`);
    if (!Array.isArray(problem.testCases) || !problem.testCases.length) throw new AppError(400, `Problem "${String(problem.title)}" needs judge test cases`);
    const examples = problem.examples.map((example) => {
      if (!example || typeof example !== 'object' || Array.isArray(example)) throw new AppError(400, 'Each example must be an object');
      const entry = example as Record<string, unknown>;
      if (typeof entry.input !== 'string' || !entry.input.trim() || typeof entry.output !== 'string' || !entry.output.trim()) throw new AppError(400, 'Example input and output are required');
      if (entry.explanation !== undefined && typeof entry.explanation !== 'string') throw new AppError(400, 'Example explanation must be text');
      return { input: entry.input, output: entry.output, explanation: entry.explanation as string | undefined };
    });
    const testCases = problem.testCases.map((testCase) => {
      if (!testCase || typeof testCase !== 'object' || Array.isArray(testCase)) throw new AppError(400, 'Each test case must be an object');
      const entry = testCase as Record<string, unknown>;
      if (typeof entry.input !== 'string' || typeof entry.output !== 'string') throw new AppError(400, 'Test case input and expected output must be text');
      if (entry.isHidden !== undefined && typeof entry.isHidden !== 'boolean') throw new AppError(400, 'Test case visibility must be a boolean');
      return { input: entry.input, output: entry.output, isHidden: entry.isHidden ?? true };
    });
    if (!testCases.some((testCase) => testCase.isHidden)) throw new AppError(400, `Problem "${String(problem.title)}" needs at least one hidden judge test case`);
    return { ...(problem as unknown as CreateProblemInput), timeLimit: Number(problem.timeLimit), memoryLimit: Number(problem.memoryLimit), points: Number(problem.points), examples, testCases };
  });

  const roundIds = problems.map((problem) => problem.roundId);
  const created = await prisma.$transaction(async (transaction) => {
    const uniqueRoundIds = [...new Set(roundIds)];
    const rounds = await transaction.round.findMany({
      where: { id: { in: uniqueRoundIds } },
      include: { problems: { select: { position: true } } },
    });
    if (rounds.length !== uniqueRoundIds.length) throw new AppError(404, 'One or more target rounds do not exist');
    const nextPositions = new Map(rounds.map((round) => [round.id, Math.max(-1, ...round.problems.map((problem) => problem.position)) + 1]));
    for (const round of rounds) {
      if (round.status !== 'PENDING') throw new AppError(409, `Round ${round.name} is locked and cannot receive imported problems`);
    }
    const results = [];
    for (const problem of problems) {
      results.push(await transaction.problem.create({
        data: {
          title: problem.title,
          description: problem.description,
          inputFormat: problem.inputFormat,
          outputFormat: problem.outputFormat,
          constraints: problem.constraints,
          difficulty: problem.difficulty,
          timeLimit: problem.timeLimit,
          memoryLimit: problem.memoryLimit,
          points: problem.points,
          roundId: problem.roundId,
          position: nextPositions.get(problem.roundId) ?? 0,
          examples: { create: problem.examples.map((example, position) => ({ ...example, position })) },
          testCases: { create: problem.testCases },
        },
      }));
      nextPositions.set(problem.roundId, (nextPositions.get(problem.roundId) ?? 0) + 1);
    }
    return results;
  });
  for (const problem of created) await recordAuditLog(adminId, 'PROBLEM_CREATE', `Problem ${problem.id} (${problem.title}) imported for round ${problem.roundId}`);
  await recordAuditLog(adminId, 'BULK_IMPORT', `${created.length} coding problem(s) imported`);
  return created;
}

export async function updateProblem(id: string, data: Partial<CreateProblemInput>, adminId: string) {
  await assertProblemEditable(id);
  validateProblemFields(data);
  if (data.roundId) {
    const targetRound = await prisma.round.findUnique({ where: { id: data.roundId }, select: { status: true } });
    if (!targetRound) throw new AppError(404, 'Round not found');
    if (targetRound.status !== 'PENDING') throw new AppError(409, 'Questions can only be attached to pending rounds');
  }
  const currentProblem = await prisma.problem.findUnique({ where: { id }, select: { roundId: true } });
  const position = data.roundId && currentProblem?.roundId !== data.roundId
    ? (await prisma.problem.aggregate({ where: { roundId: data.roundId }, _max: { position: true } }))._max.position! + 1
    : undefined;
  const problem = await prisma.problem.update({
    where: { id },
    data: {
      ...data,
      timeLimit: data.timeLimit === undefined ? undefined : Number(data.timeLimit),
      memoryLimit: data.memoryLimit === undefined ? undefined : Number(data.memoryLimit),
      points: data.points === undefined ? undefined : Number(data.points),
      position,
    },
  });
  await recordAuditLog(adminId, 'PROBLEM_UPDATE', `Problem ${problem.id} (${problem.title}) updated`);
  return problem;
}

export async function deleteProblem(id: string, adminId: string) {
  await assertProblemEditable(id);
  const problem = await prisma.problem.findUnique({ where: { id }, select: { title: true, _count: { select: { submissions: true } } } });
  if (!problem) throw new AppError(404, 'Problem not found');
  if (problem._count.submissions > 0) throw new AppError(409, 'Problem cannot be deleted because submissions already exist');
  await prisma.$transaction(async (transaction) => {
    await transaction.testCase.deleteMany({ where: { problemId: id } });
    await transaction.problemExample.deleteMany({ where: { problemId: id } });
    await transaction.problem.delete({ where: { id } });
  });
  await recordAuditLog(adminId, 'PROBLEM_DELETE', `Problem ${id} (${problem.title}) deleted`);
}

export async function duplicateProblem(id: string, targetRoundId: string | undefined, adminId: string) {
  const source = await prisma.problem.findUnique({
    where: { id },
    include: { examples: true, testCases: true },
  });
  if (!source) throw new AppError(404, 'Problem not found');

  const destinationRound = await prisma.round.findUnique({
    where: { id: targetRoundId || source.roundId },
    select: { status: true },
  });
  if (!destinationRound) throw new AppError(404, 'Round not found');
  if (destinationRound.status !== 'PENDING') throw new AppError(409, 'Problems can only be duplicated into pending rounds');
  const targetRoundIdResolved = targetRoundId || source.roundId;
  const lastProblem = await prisma.problem.aggregate({ where: { roundId: targetRoundIdResolved }, _max: { position: true } });

  const copy = await prisma.problem.create({
    data: {
      title: `${source.title} (Copy)`,
      description: source.description,
      inputFormat: source.inputFormat,
      outputFormat: source.outputFormat,
      constraints: source.constraints,
      difficulty: source.difficulty,
      timeLimit: source.timeLimit,
      memoryLimit: source.memoryLimit,
      roundId: targetRoundIdResolved,
      position: (lastProblem._max.position ?? -1) + 1,
      points: Number(source.points),
      examples: {
        create: source.examples.map((example) => ({
          position: example.position,
          input: example.input,
          output: example.output,
          explanation: example.explanation,
        })),
      },
      testCases: {
        create: source.testCases.map((testCase) => ({
          input: testCase.input,
          output: testCase.output,
          isHidden: testCase.isHidden,
        })),
      },
    },
  });

  await recordAuditLog(adminId, 'PROBLEM_DUPLICATE', `Problem ${copy.id} duplicated from ${source.id}`);
  return copy;
}

export async function getProblemTestCases(problemId: string) {
  return prisma.testCase.findMany({ where: { problemId } });
}

export async function addTestCase(
  problemId: string,
  input: string,
  output: string,
  isHidden: boolean = true,
  adminId?: string,
) {
  await assertProblemEditable(problemId);
  if (typeof input !== 'string' || typeof output !== 'string') throw new AppError(400, 'Test case input and expected output must be text');
  if (typeof isHidden !== 'boolean') throw new AppError(400, 'Test case visibility must be a boolean');
  const testCase = await prisma.testCase.create({
    data: {
      problemId,
      input,
      output,
      isHidden,
    },
  });
  if (adminId) await recordAuditLog(adminId, 'TEST_CASE_CREATE', `Test case ${testCase.id} added to problem ${problemId}`);
  return testCase;
}

export async function updateTestCase(problemId: string, id: string, data: { input?: string; output?: string; isHidden?: boolean }, adminId: string) {
  await assertProblemEditable(problemId);
  const existing = await prisma.testCase.findUnique({ where: { id } });
  if (!existing || existing.problemId !== problemId) throw new AppError(404, 'Test case not found');
  if (data.input !== undefined && typeof data.input !== 'string') throw new AppError(400, 'Test case input must be text');
  if (data.output !== undefined && typeof data.output !== 'string') throw new AppError(400, 'Expected output must be text');
  if (data.isHidden !== undefined && typeof data.isHidden !== 'boolean') throw new AppError(400, 'Test case visibility must be a boolean');
  const testCase = await prisma.testCase.update({ where: { id }, data });
  await recordAuditLog(adminId, 'TEST_CASE_UPDATE', `Test case ${id} updated`);
  return testCase;
}

export async function deleteTestCase(problemId: string, id: string, adminId: string) {
  await assertProblemEditable(problemId);
  const existing = await prisma.testCase.findUnique({ where: { id } });
  if (!existing || existing.problemId !== problemId) throw new AppError(404, 'Test case not found');
  await prisma.testCase.delete({ where: { id } });
  await recordAuditLog(adminId, 'TEST_CASE_DELETE', `Test case ${id} deleted`);
}

export async function duplicateTestCase(problemId: string, id: string, adminId: string) {
  await assertProblemEditable(problemId);
  const existing = await prisma.testCase.findUnique({ where: { id } });
  if (!existing || existing.problemId !== problemId) throw new AppError(404, 'Test case not found');
  const copy = await prisma.testCase.create({ data: { problemId, input: existing.input, output: existing.output, isHidden: existing.isHidden } });
  await recordAuditLog(adminId, 'TEST_CASE_CREATE', `Test case ${copy.id} duplicated from ${id}`);
  return copy;
}

export async function getProblemExamples(problemId: string) {
  return prisma.problemExample.findMany({ where: { problemId }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
}

export async function addExample(
  problemId: string,
  input: string,
  output: string,
  explanation?: string,
  adminId?: string,
) {
  await assertProblemEditable(problemId);
  if (typeof input !== 'string' || !input.trim() || typeof output !== 'string' || !output.trim()) throw new AppError(400, 'Example input and output are required');
  if (explanation !== undefined && typeof explanation !== 'string') throw new AppError(400, 'Example explanation must be text');
  const lastExample = await prisma.problemExample.aggregate({ where: { problemId }, _max: { position: true } });
  const example = await prisma.problemExample.create({
    data: {
      problemId,
      position: (lastExample._max.position ?? -1) + 1,
      input,
      output,
      explanation,
    },
  });
  if (adminId) await recordAuditLog(adminId, 'EXAMPLE_CREATE', `Example ${example.id} added to problem ${problemId}`);
  return example;
}

export async function updateExample(problemId: string, id: string, data: { input?: string; output?: string; explanation?: string | null }, adminId: string) {
  await assertProblemEditable(problemId);
  const existing = await prisma.problemExample.findUnique({ where: { id } });
  if (!existing || existing.problemId !== problemId) throw new AppError(404, 'Example not found');
  if (data.input !== undefined && (typeof data.input !== 'string' || !data.input.trim())) throw new AppError(400, 'Example input is required');
  if (data.output !== undefined && (typeof data.output !== 'string' || !data.output.trim())) throw new AppError(400, 'Example output is required');
  if (data.explanation !== undefined && data.explanation !== null && typeof data.explanation !== 'string') throw new AppError(400, 'Example explanation must be text');
  const example = await prisma.problemExample.update({ where: { id }, data });
  await recordAuditLog(adminId, 'EXAMPLE_UPDATE', `Example ${id} updated`);
  return example;
}

export async function deleteExample(problemId: string, id: string, adminId: string) {
  await assertProblemEditable(problemId);
  const existing = await prisma.problemExample.findUnique({ where: { id } });
  if (!existing || existing.problemId !== problemId) throw new AppError(404, 'Example not found');
  await prisma.problemExample.delete({ where: { id } });
  await recordAuditLog(adminId, 'EXAMPLE_DELETE', `Example ${id} deleted`);
}

export async function reorderExamples(problemId: string, ids: string[], adminId: string) {
  await assertProblemEditable(problemId);
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new AppError(400, 'Provide each example ID once in the desired order');
  }
  const existing = await prisma.problemExample.findMany({ where: { problemId }, select: { id: true } });
  if (existing.length !== ids.length || existing.some((example) => !ids.includes(example.id))) {
    throw new AppError(400, 'Example order must include every example for this problem');
  }
  await prisma.$transaction(ids.map((id, position) => prisma.problemExample.update({ where: { id }, data: { position } })));
  await recordAuditLog(adminId, 'EXAMPLE_UPDATE', `Examples reordered for problem ${problemId}`);
}

export interface CreateRoundInput {
  roundType: RoundType;
  duration: number;
  readingPeriodSeconds?: number;
  autoSubmitOnEnd?: boolean;
}

export async function listRounds() {
  const rounds = await prisma.round.findMany({
    include: {
      problems: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          position: true,
          description: true,
          inputFormat: true,
          outputFormat: true,
          constraints: true,
          difficulty: true,
          timeLimit: true,
          memoryLimit: true,
          points: true,
          examples: { select: { id: true } },
          testCases: { select: { isHidden: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return rounds
    .map((round) => ({
      ...round,
      readiness: (() => {
        const readiness = getRoundReadiness(round);
        if (round.roundType !== 'CODE_IN_DARK') return readiness;
        const codeRunEnded = rounds.some((candidate) => candidate.roundType === 'CODE_RUN' && candidate.status === 'ENDED');
        const sequenceCheck = { key: 'round-order', label: 'Code Run completed first', ready: codeRunEnded };
        const checks = [...readiness.checks, sequenceCheck];
        const missing = codeRunEnded ? readiness.missing : [...readiness.missing, sequenceCheck.key];
        return { ready: missing.length === 0, checks, missing };
      })(),
      problems: round.problems.map((problem) => ({
        id: problem.id,
        title: problem.title,
        position: problem.position,
        points: problem.points,
        exampleCount: problem.examples.length,
        testCaseCount: problem.testCases.length,
        hiddenTestCaseCount: problem.testCases.filter((testCase) => testCase.isHidden).length,
        ready: getRoundReadiness({ ...round, problems: [problem] }).ready,
      })),
    }))
    .sort((first, second) => first.roundType.localeCompare(second.roundType) * -1);
}

export async function reorderRoundProblems(roundId: string, ids: string[], adminId: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true, status: true } });
  if (!round) throw new AppError(404, 'Round not found');
  if (round.status !== 'PENDING') throw new AppError(409, 'Problem order is locked after the round starts');
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new AppError(400, 'Provide each problem ID once in the desired order');
  }
  const existing = await prisma.problem.findMany({ where: { roundId }, select: { id: true } });
  if (existing.length !== ids.length || existing.some((problem) => !ids.includes(problem.id))) {
    throw new AppError(400, 'Problem order must include every problem in this round');
  }
  await prisma.$transaction(ids.map((id, position) => prisma.problem.update({ where: { id }, data: { position } })));
  await recordAuditLog(adminId, 'PROBLEM_REORDER', `Problems reordered for round ${roundId}`);
}

export async function createRound(data: CreateRoundInput, adminId: string) {
  const { roundType, duration, autoSubmitOnEnd = true } = data;
  if (!Object.hasOwn(ROUND_TYPES, roundType) || !Number.isInteger(Number(duration)) || Number(duration) <= 0 || Number(duration) > 360) {
    throw new AppError(400, 'Select one of the supported rounds and provide a positive duration');
  }
  if (data.autoSubmitOnEnd !== undefined && typeof data.autoSubmitOnEnd !== 'boolean') throw new AppError(400, 'autoSubmitOnEnd must be a boolean');

  const existingRound = await prisma.round.findFirst({ where: { roundType } });
  if (existingRound) throw new AppError(409, `${ROUND_TYPES[roundType].name} already exists`);

  const readingPeriodSeconds = roundType === 'CODE_IN_DARK'
    ? Number(data.readingPeriodSeconds ?? ROUND_TYPES.CODE_IN_DARK.readingPeriodSeconds)
    : 0;
  if (!Number.isInteger(readingPeriodSeconds) || (roundType === 'CODE_IN_DARK' && (readingPeriodSeconds < 30 || readingPeriodSeconds > 600))) {
    throw new AppError(400, 'Code in the Dark reading period must be between 30 and 600 seconds');
  }

  const round = await prisma.round.create({
    data: {
      name: ROUND_TYPES[roundType].name,
      roundType,
      duration: Number(duration),
      readingPeriodSeconds,
      autoSubmitOnEnd: Boolean(autoSubmitOnEnd),
    },
  });

  await recordAuditLog(adminId, 'ROUND_CREATE', `Round ${round.id} created and configured`);
  return round;
}

export async function updateRound(id: string, data: Partial<CreateRoundInput>, adminId: string) {
  const round = await prisma.round.findUnique({ where: { id } });
  if (!round) throw new AppError(404, 'Round not found');
  if (round.status !== 'PENDING') throw new AppError(409, 'Round configuration is locked after the round starts');
  if (data.roundType !== undefined && data.roundType !== round.roundType) throw new AppError(400, 'Round type cannot be changed after creation');

  if (data.duration !== undefined && (!Number.isInteger(Number(data.duration)) || Number(data.duration) <= 0 || Number(data.duration) > 360)) {
    throw new AppError(400, 'Round duration must be a whole number between 1 and 360 minutes');
  }
  if (data.autoSubmitOnEnd !== undefined && typeof data.autoSubmitOnEnd !== 'boolean') throw new AppError(400, 'autoSubmitOnEnd must be a boolean');

  const readingPeriodSeconds = data.readingPeriodSeconds === undefined
    ? undefined
    : Number(data.readingPeriodSeconds);
  if (readingPeriodSeconds !== undefined && (
    !Number.isInteger(readingPeriodSeconds)
    || (round.roundType === 'CODE_IN_DARK' && (readingPeriodSeconds < 30 || readingPeriodSeconds > 600))
    || (round.roundType === 'CODE_RUN' && readingPeriodSeconds !== 0)
  )) {
    throw new AppError(400, 'Reading period must be 30-600 seconds for Code in the Dark and zero for Code Run');
  }

  const updated = await prisma.round.update({
    where: { id },
    data: {
      duration: data.duration === undefined ? undefined : Number(data.duration),
      readingPeriodSeconds,
      autoSubmitOnEnd: data.autoSubmitOnEnd,
    },
  });
  await recordAuditLog(adminId, 'ROUND_UPDATE', `Round ${id} configuration updated`);
  return updated;
}

export async function resetRound(id: string, adminId: string) {
  const current = await prisma.round.findUnique({ where: { id } });
  if (!current) throw new AppError(404, 'Round not found');
  if (current.status === 'ACTIVE') throw new AppError(409, 'An active round must be ended before it can be reset');
  const round = await prisma.round.update({
    where: { id },
    data: {
      status: 'PENDING',
      startTime: null,
      endTime: null,
      pausedAt: null,
    },
  });

  await recordAuditLog(adminId, 'ROUND_RESET', `Round ${round.id} reset`);
  return round;
}

export async function deleteRound(id: string, adminId: string) {
  const round = await prisma.round.findUnique({
    where: { id },
    include: { problems: { include: { _count: { select: { submissions: true } } } } },
  });
  if (!round) throw new AppError(404, 'Round not found');
  if (round.status !== 'PENDING') throw new AppError(409, 'Only a pending round can be deleted');
  if (round.problems.some((problem) => problem._count.submissions > 0)) throw new AppError(409, 'Round cannot be deleted because submissions already exist');
  await prisma.$transaction(async (transaction) => {
    const problemIds = round.problems.map((problem) => problem.id);
    await transaction.testCase.deleteMany({ where: { problemId: { in: problemIds } } });
    await transaction.problemExample.deleteMany({ where: { problemId: { in: problemIds } } });
    await transaction.problem.deleteMany({ where: { roundId: id } });
    await transaction.round.delete({ where: { id } });
  });
  await recordAuditLog(adminId, 'ROUND_DELETE', `Round ${round.id} (${round.name}) deleted`);
}

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

async function assertProblemEditable(problemId: string) {
  const problem = await prisma.problem.findUnique({ where: { id: problemId }, select: { round: { select: { status: true } } } });
  if (!problem) throw new AppError(404, 'Problem not found');
  if (problem.round.status !== 'PENDING') throw new AppError(409, 'Questions can only be changed before their round starts');
}

export async function listProblems() {
  return prisma.problem.findMany({
    include: { round: true },
    orderBy: { title: 'asc' },
  });
}

export async function getProblemById(id: string) {
  const problem = await prisma.problem.findUnique({
    where: { id },
    include: { round: true },
  });
  if (!problem) throw new AppError(404, 'Problem not found');
  return problem;
}

export async function createProblem(data: CreateProblemInput, adminId: string) {
  const round = await prisma.round.findUnique({ where: { id: data.roundId }, select: { status: true, roundType: true, _count: { select: { problems: true } } } });
  if (!round) throw new AppError(404, 'Round not found');
  if (round.status !== 'PENDING') throw new AppError(409, 'Problems can only be added to pending rounds');
  if (round._count.problems > 0) throw new AppError(409, 'Each contest round can have one question');

  const points = Number(data.points ?? 100);
  if (!Number.isInteger(points) || points < 1 || points > 10_000) {
    throw new AppError(400, 'Problem points must be an integer between 1 and 10000');
  }

  const problem = await prisma.problem.create({ data: { ...data, points } });
  await recordAuditLog(
    adminId,
    'PROBLEM_CREATE',
    `Problem ${problem.id} (${problem.title}) created for round ${data.roundId}`
  );
  return problem;
}

export async function updateProblem(id: string, data: Partial<CreateProblemInput>, adminId: string) {
  await assertProblemEditable(id);
  if (data.roundId) {
    const targetRound = await prisma.round.findUnique({ where: { id: data.roundId }, select: { status: true } });
    if (!targetRound) throw new AppError(404, 'Round not found');
    if (targetRound.status !== 'PENDING') throw new AppError(409, 'Questions can only be attached to pending rounds');
  }
  if (data.points !== undefined) {
    const points = Number(data.points);
    if (!Number.isInteger(points) || points < 1 || points > 10_000) {
      throw new AppError(400, 'Problem points must be an integer between 1 and 10000');
    }
    data.points = points;
  }
  const problem = await prisma.problem.update({
    where: { id },
    data,
  });
  await recordAuditLog(adminId, 'PROBLEM_UPDATE', `Problem ${problem.id} (${problem.title}) updated`);
  return problem;
}

export async function deleteProblem(id: string, adminId: string) {
  await assertProblemEditable(id);
  await prisma.problem.delete({ where: { id } });
  await recordAuditLog(adminId, 'PROBLEM_UPDATE', `Problem ${id} deleted`);
}

export async function duplicateProblem(id: string, targetRoundId: string | undefined, adminId: string) {
  const source = await prisma.problem.findUnique({
    where: { id },
    include: { examples: true, testCases: true },
  });
  if (!source) throw new AppError(404, 'Problem not found');

  const destinationRound = await prisma.round.findUnique({
    where: { id: targetRoundId || source.roundId },
    select: { status: true, _count: { select: { problems: true } } },
  });
  if (!destinationRound) throw new AppError(404, 'Round not found');
  if (destinationRound.status !== 'PENDING') throw new AppError(409, 'Problems can only be duplicated into pending rounds');
  if (destinationRound._count.problems > 0) throw new AppError(409, 'Each contest round can have one question');

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
      roundId: targetRoundId || source.roundId,
      examples: {
        create: source.examples.map((example) => ({
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

  await recordAuditLog(adminId, 'PROBLEM_CREATE', `Problem ${copy.id} duplicated from ${source.id}`);
  return copy;
}

export async function getProblemTestCases(problemId: string) {
  return prisma.testCase.findMany({ where: { problemId } });
}

export async function addTestCase(
  problemId: string,
  input: string,
  output: string,
  isHidden: boolean = true
) {
  await assertProblemEditable(problemId);
  if (input === undefined || output === undefined) {
    throw new AppError(400, 'Input and output are required');
  }
  return prisma.testCase.create({
    data: {
      problemId,
      input,
      output,
      isHidden: Boolean(isHidden),
    },
  });
}

export async function getProblemExamples(problemId: string) {
  return prisma.problemExample.findMany({ where: { problemId } });
}

export async function addExample(
  problemId: string,
  input: string,
  output: string,
  explanation?: string
) {
  await assertProblemEditable(problemId);
  if (input === undefined || output === undefined) {
    throw new AppError(400, 'Input and output are required');
  }
  return prisma.problemExample.create({
    data: {
      problemId,
      input,
      output,
      explanation,
    },
  });
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
        select: { id: true, title: true, points: true, _count: { select: { testCases: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });
  return rounds
    .map((round) => ({
      ...round,
      problems: round.problems.map(({ _count, ...problem }) => ({ ...problem, testCaseCount: _count.testCases })),
    }))
    .sort((first, second) => first.roundType.localeCompare(second.roundType) * -1);
}

export async function createRound(data: CreateRoundInput, adminId: string) {
  const { roundType, duration, autoSubmitOnEnd = true } = data;
  if (!Object.hasOwn(ROUND_TYPES, roundType) || !Number.isInteger(Number(duration)) || Number(duration) <= 0) {
    throw new AppError(400, 'Select one of the supported rounds and provide a positive duration');
  }

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

  await recordAuditLog(adminId, 'ROUND_START', `Round ${round.id} created and configured`);
  return round;
}

export async function updateRound(id: string, data: Partial<CreateRoundInput>) {
  const round = await prisma.round.findUnique({ where: { id } });
  if (!round) throw new AppError(404, 'Round not found');

  if (data.duration !== undefined && (!Number.isInteger(Number(data.duration)) || Number(data.duration) <= 0)) {
    throw new AppError(400, 'Round duration must be a positive whole number of minutes');
  }

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

  return prisma.round.update({
    where: { id },
    data: {
      duration: data.duration === undefined ? undefined : Number(data.duration),
      readingPeriodSeconds,
      autoSubmitOnEnd: data.autoSubmitOnEnd,
    },
  });
}

export async function resetRound(id: string, adminId: string) {
  const round = await prisma.round.update({
    where: { id },
    data: {
      status: 'PENDING',
      startTime: null,
      endTime: null,
      pausedAt: null,
    },
  });

  await recordAuditLog(adminId, 'ROUND_END', `Round ${round.id} reset`);
  return round;
}

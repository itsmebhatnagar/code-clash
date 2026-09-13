import { prisma } from '../db';
import { recordAuditLog } from '../audit';
import { AppError } from '../middleware/errorMiddleware';

// ── Workstations ─────────────────────────────────────────────────────────────

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

// ── Problems ─────────────────────────────────────────────────────────────────

export interface CreateProblemInput {
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  difficulty: string;
  timeLimit: number;
  memoryLimit: number;
  roundId: string;
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
  const problem = await prisma.problem.create({ data });
  await recordAuditLog(
    adminId,
    'PROBLEM_CREATE',
    `Problem ${problem.id} (${problem.title}) created for round ${data.roundId}`
  );
  return problem;
}

export async function updateProblem(id: string, data: Partial<CreateProblemInput>, adminId: string) {
  const problem = await prisma.problem.update({
    where: { id },
    data,
  });
  await recordAuditLog(adminId, 'PROBLEM_UPDATE', `Problem ${problem.id} (${problem.title}) updated`);
  return problem;
}

export async function deleteProblem(id: string, adminId: string) {
  await prisma.problem.delete({ where: { id } });
  await recordAuditLog(adminId, 'PROBLEM_UPDATE', `Problem ${id} deleted`);
}

export async function duplicateProblem(id: string, targetRoundId: string | undefined, adminId: string) {
  const source = await prisma.problem.findUnique({
    where: { id },
    include: { examples: true, testCases: true },
  });
  if (!source) throw new AppError(404, 'Problem not found');

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

// ── Rounds ───────────────────────────────────────────────────────────────────

export interface CreateRoundInput {
  name: string;
  duration: number;
  lateEntryCutoffMinutes?: number;
  autoSubmitOnEnd?: boolean;
}

export async function listRounds() {
  return prisma.round.findMany({
    include: {
      problems: {
        select: { id: true, title: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function createRound(data: CreateRoundInput, adminId: string) {
  const { name, duration, lateEntryCutoffMinutes = 10, autoSubmitOnEnd = true } = data;
  if (!name || !Number.isFinite(Number(duration)) || Number(duration) <= 0) {
    throw new AppError(400, 'Round name and positive duration are required');
  }

  const round = await prisma.round.create({
    data: {
      name,
      duration: Number(duration),
      lateEntryCutoffMinutes: Number(lateEntryCutoffMinutes),
      autoSubmitOnEnd: Boolean(autoSubmitOnEnd),
    },
  });

  await recordAuditLog(adminId, 'ROUND_START', `Round ${round.id} created and configured`);
  return round;
}

export async function updateRound(id: string, data: Partial<CreateRoundInput>) {
  return prisma.round.update({
    where: { id },
    data: {
      name: data.name,
      duration: data.duration === undefined ? undefined : Number(data.duration),
      lateEntryCutoffMinutes:
        data.lateEntryCutoffMinutes === undefined ? undefined : Number(data.lateEntryCutoffMinutes),
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

import { prisma } from '../db';
import { recordAuditLog } from '../audit';
import { syncLeaderboardScore } from '../redis';
import { AppError } from '../middleware/errorMiddleware';

export interface JudgeEvaluationInput {
  codeQuality?: number;
  logicClarity?: number;
  judgeComments?: string;
}

export interface AdjustScoreInput {
  round1Score?: number;
  round2Score?: number;
  manualAdjustments?: number;
  judgeComments?: string;
  reason?: string;
}

export async function listEvaluations() {
  return prisma.evaluation.findMany({
    include: {
      participant: {
        select: { name: true, email: true },
      },
    },
  });
}

export async function lockEvaluation(id: string, adminId: string) {
  const evaluation = await prisma.evaluation.update({
    where: { id },
    data: { lockedAt: new Date(), lockedBy: adminId },
  });
  await recordAuditLog(adminId, 'SCORE_ADJUSTMENT', `Evaluation ${evaluation.id} locked`);
  return evaluation;
}

export async function unlockEvaluation(id: string) {
  return prisma.evaluation.update({
    where: { id },
    data: { lockedAt: null, lockedBy: null },
  });
}

export async function updateJudgeEvaluation(
  participantId: string,
  input: JudgeEvaluationInput,
  adminId: string
) {
  const quality = Number(input.codeQuality ?? 0);
  const clarity = Number(input.logicClarity ?? 0);

  if (![quality, clarity].every(Number.isFinite)) {
    throw new AppError(400, 'Evaluation scores must be valid numbers');
  }

  const existing = await prisma.evaluation.findUnique({ where: { participantId } });
  if (existing?.lockedAt) {
    throw new AppError(409, 'Evaluation is locked');
  }

  const evaluation = await prisma.evaluation.upsert({
    where: { participantId },
    update: { codeQuality: quality, logicClarity: clarity, judgeComments: input.judgeComments },
    create: {
      participantId,
      codeQuality: quality,
      logicClarity: clarity,
      judgeComments: input.judgeComments,
    },
  });

  await syncLeaderboardScore(evaluation.participantId, evaluation.finalScore);
  await recordAuditLog(
    adminId,
    'SCORE_ADJUSTMENT',
    `Judge evaluation updated for participant ${participantId}`
  );

  return evaluation;
}

export async function adjustScore(
  participantId: string,
  input: AdjustScoreInput,
  adminId: string
) {
  if (!participantId) {
    throw new AppError(400, 'participantId is required');
  }

  const scores = [input.round1Score, input.round2Score, input.manualAdjustments].map((s) =>
    Number(s ?? 0)
  );

  if (scores.some((score) => !Number.isFinite(score))) {
    throw new AppError(400, 'Scores must be valid numbers');
  }

  const [normalizedRound1Score, normalizedRound2Score, normalizedManualAdjustments] = scores;
  const finalScore = normalizedRound1Score + normalizedRound2Score + normalizedManualAdjustments;

  const existingEvaluation = await prisma.evaluation.findUnique({
    where: { participantId },
    select: { lockedAt: true },
  });

  if (existingEvaluation?.lockedAt) {
    throw new AppError(409, 'Evaluation is locked');
  }

  const evaluation = await prisma.evaluation.upsert({
    where: { participantId },
    update: {
      round1Score: normalizedRound1Score,
      round2Score: normalizedRound2Score,
      manualAdjustments: normalizedManualAdjustments,
      judgeComments: input.judgeComments,
      finalScore,
    },
    create: {
      participantId,
      round1Score: normalizedRound1Score,
      round2Score: normalizedRound2Score,
      manualAdjustments: normalizedManualAdjustments,
      judgeComments: input.judgeComments,
      finalScore,
    },
  });

  await syncLeaderboardScore(participantId, finalScore);

  await prisma.scoreAdjustment.create({
    data: {
      participantId,
      adminId,
      round1Score: normalizedRound1Score,
      round2Score: normalizedRound2Score,
      manualAdjustments: normalizedManualAdjustments,
      finalScore,
      reason: String(input.reason || 'Manual score adjustment'),
    },
  });

  await recordAuditLog(adminId, 'SCORE_ADJUSTMENT', `Adjusted score for participant ${participantId}`);
  return evaluation;
}

export async function getScoreHistory(participantId: string) {
  return prisma.scoreAdjustment.findMany({
    where: { participantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function reverseScoreAdjustment(adjustmentId: string, adminId: string) {
  const adjustment = await prisma.scoreAdjustment.findUnique({
    where: { id: adjustmentId },
  });

  if (!adjustment || adjustment.reversedAt) {
    throw new AppError(404, 'Active score adjustment not found');
  }

  const evaluation = await prisma.evaluation.update({
    where: { participantId: adjustment.participantId },
    data: {
      round1Score: 0,
      round2Score: 0,
      manualAdjustments: 0,
      finalScore: 0,
    },
  });

  await syncLeaderboardScore(adjustment.participantId, 0);

  const reversed = await prisma.scoreAdjustment.update({
    where: { id: adjustment.id },
    data: { reversedAt: new Date(), reversedBy: adminId },
  });

  await recordAuditLog(
    adminId,
    'SCORE_ADJUSTMENT',
    `Score adjustment ${adjustment.id} reversed for participant ${adjustment.participantId}`
  );

  return { evaluation, adjustment: reversed };
}

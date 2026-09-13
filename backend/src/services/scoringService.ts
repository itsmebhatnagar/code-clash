import type { ScoreAdjustment } from '@prisma/client';
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

const ROUND_SCORE_MIN   = 0;
const ROUND_SCORE_MAX   = 500;
const MANUAL_ADJ_MIN    = -500;
const MANUAL_ADJ_MAX    = 500;
const QUALITY_MIN       = 0;
const QUALITY_MAX       = 100;

function assertRoundScore(value: number, label: string) {
  if (!Number.isFinite(value) || value < ROUND_SCORE_MIN || value > ROUND_SCORE_MAX) {
    throw new AppError(400, `${label} must be between ${ROUND_SCORE_MIN} and ${ROUND_SCORE_MAX}`);
  }
}

function assertManualAdjustment(value: number) {
  if (!Number.isFinite(value) || value < MANUAL_ADJ_MIN || value > MANUAL_ADJ_MAX) {
    throw new AppError(400, `manualAdjustments must be between ${MANUAL_ADJ_MIN} and ${MANUAL_ADJ_MAX}`);
  }
}

function assertQualityScore(value: number, label: string) {
  if (!Number.isFinite(value) || value < QUALITY_MIN || value > QUALITY_MAX) {
    throw new AppError(400, `${label} must be between ${QUALITY_MIN} and ${QUALITY_MAX}`);
  }
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

export async function unlockEvaluation(id: string, adminId: string) {
  const evaluation = await prisma.evaluation.update({
    where: { id },
    data: { lockedAt: null, lockedBy: null },
  });
  await recordAuditLog(adminId, 'SCORE_ADJUSTMENT', `Evaluation ${evaluation.id} unlocked`);
  return evaluation;
}

export async function updateJudgeEvaluation(
  participantId: string,
  input: JudgeEvaluationInput,
  adminId: string
) {
  const quality = Number(input.codeQuality ?? 0);
  const clarity = Number(input.logicClarity ?? 0);

  assertQualityScore(quality, 'codeQuality');
  assertQualityScore(clarity, 'logicClarity');

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

  const existingEvaluation = await prisma.evaluation.findUnique({
    where: { participantId },
  });

  if (existingEvaluation?.lockedAt) {
    throw new AppError(409, 'Evaluation is locked');
  }

  const r1 = input.round1Score !== undefined
    ? Number(input.round1Score)
    : (existingEvaluation?.round1Score ?? 0);
  const r2 = input.round2Score !== undefined
    ? Number(input.round2Score)
    : (existingEvaluation?.round2Score ?? 0);
  const manual = input.manualAdjustments !== undefined
    ? Number(input.manualAdjustments)
    : (existingEvaluation?.manualAdjustments ?? 0);

  assertRoundScore(r1, 'round1Score');
  assertRoundScore(r2, 'round2Score');
  assertManualAdjustment(manual);

  const finalScore = r1 + r2 + manual;

  const prevR1     = existingEvaluation?.round1Score        ?? 0;
  const prevR2     = existingEvaluation?.round2Score        ?? 0;
  const prevManual = existingEvaluation?.manualAdjustments  ?? 0;
  const prevFinal  = existingEvaluation?.finalScore
    ?? (prevR1 + prevR2 + prevManual);

  const evaluation = await prisma.$transaction(async (tx) => {
    const eval_ = await tx.evaluation.upsert({
      where: { participantId },
      update: {
        round1Score: r1,
        round2Score: r2,
        manualAdjustments: manual,
        judgeComments: input.judgeComments,
        finalScore,
      },
      create: {
        participantId,
        round1Score: r1,
        round2Score: r2,
        manualAdjustments: manual,
        judgeComments: input.judgeComments,
        finalScore,
      },
    });

    await tx.scoreAdjustment.create({
      data: {
        participantId,
        adminId,
        round1Score:               r1,
        round2Score:               r2,
        manualAdjustments:         manual,
        finalScore,
        previousRound1Score:       prevR1,
        previousRound2Score:       prevR2,
        previousManualAdjustments: prevManual,
        previousFinalScore:        prevFinal,
        reason: String(input.reason || 'Manual score adjustment'),
      },
    });

    return eval_;
  });

  await syncLeaderboardScore(participantId, finalScore);
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
  const adjustment: ScoreAdjustment | null = await prisma.scoreAdjustment.findUnique({
    where: { id: adjustmentId },
  });

  if (!adjustment || adjustment.reversedAt) {
    throw new AppError(404, 'Active score adjustment not found');
  }

  const existingEvaluation = await prisma.evaluation.findUnique({
    where: { participantId: adjustment.participantId },
  });

  if (existingEvaluation?.lockedAt) {
    throw new AppError(409, 'Evaluation is locked');
  }

  const { evaluation, reversed, newFinalScore } = await prisma.$transaction(async (tx) => {
    const reversed = await tx.scoreAdjustment.update({
      where: { id: adjustment.id },
      data: { reversedAt: new Date(), reversedBy: adminId },
    });

    const remaining: ScoreAdjustment[] = await tx.scoreAdjustment.findMany({
      where: { participantId: adjustment.participantId, reversedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    let newR1: number;
    let newR2: number;
    let newManual: number;
    let newFinal: number;

    if (remaining.length > 0) {
      const latest = remaining[0];
      if (adjustment.createdAt >= latest.createdAt) {
        newR1     = latest.round1Score;
        newR2     = latest.round2Score;
        newManual = latest.manualAdjustments;
        newFinal  = latest.finalScore;
      } else {
        const deltaR1     = adjustment.round1Score       - (adjustment.previousRound1Score       ?? 0);
        const deltaR2     = adjustment.round2Score       - (adjustment.previousRound2Score       ?? 0);
        const deltaManual = adjustment.manualAdjustments - (adjustment.previousManualAdjustments ?? 0);

        newR1     = (existingEvaluation?.round1Score      ?? 0) - deltaR1;
        newR2     = (existingEvaluation?.round2Score      ?? 0) - deltaR2;
        newManual = (existingEvaluation?.manualAdjustments ?? 0) - deltaManual;
        newFinal  = newR1 + newR2 + newManual;
      }
    } else if (adjustment.previousRound1Score !== null && adjustment.previousRound1Score !== undefined) {
      newR1     = adjustment.previousRound1Score;
      newR2     = adjustment.previousRound2Score      ?? 0;
      newManual = adjustment.previousManualAdjustments ?? 0;
      newFinal  = adjustment.previousFinalScore
        ?? (newR1 + newR2 + newManual);
    } else {
      newR1     = existingEvaluation?.round1Score  ?? 0;
      newR2     = existingEvaluation?.round2Score  ?? 0;
      newManual = 0;
      newFinal  = newR1 + newR2;
    }

    const evaluation = await tx.evaluation.update({
      where: { participantId: adjustment.participantId },
      data: {
        round1Score:       newR1,
        round2Score:       newR2,
        manualAdjustments: newManual,
        finalScore:        newFinal,
      },
    });

    return { evaluation, reversed, newFinalScore: newFinal };
  });

  await syncLeaderboardScore(adjustment.participantId, newFinalScore);
  await recordAuditLog(
    adminId,
    'SCORE_ADJUSTMENT',
    `Score adjustment ${adjustment.id} reversed for participant ${adjustment.participantId}`
  );

  return { evaluation, adjustment: reversed };
}

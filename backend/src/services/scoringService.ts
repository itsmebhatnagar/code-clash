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

export interface ScoreAdjustmentRecord {
  id: string;
  participantId: string;
  adminId: string;
  round1Score: number;
  round2Score: number;
  manualAdjustments: number;
  finalScore: number;
  previousRound1Score?: number | null;
  previousRound2Score?: number | null;
  previousManualAdjustments?: number | null;
  previousFinalScore?: number | null;
  reason: string;
  reversedAt?: Date | null;
  reversedBy?: string | null;
  createdAt: Date;
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

  const existingEvaluation = await prisma.evaluation.findUnique({
    where: { participantId },
  });

  if (existingEvaluation?.lockedAt) {
    throw new AppError(409, 'Evaluation is locked');
  }

  const normalizedRound1Score = input.round1Score !== undefined
    ? Number(input.round1Score)
    : (existingEvaluation?.round1Score ?? 0);
  const normalizedRound2Score = input.round2Score !== undefined
    ? Number(input.round2Score)
    : (existingEvaluation?.round2Score ?? 0);
  const normalizedManualAdjustments = input.manualAdjustments !== undefined
    ? Number(input.manualAdjustments)
    : (existingEvaluation?.manualAdjustments ?? 0);

  const scores = [normalizedRound1Score, normalizedRound2Score, normalizedManualAdjustments];
  if (scores.some((score) => !Number.isFinite(score))) {
    throw new AppError(400, 'Scores must be valid numbers');
  }

  const finalScore = normalizedRound1Score + normalizedRound2Score + normalizedManualAdjustments;

  const prevRound1Score = existingEvaluation?.round1Score ?? 0;
  const prevRound2Score = existingEvaluation?.round2Score ?? 0;
  const prevManualAdjustments = existingEvaluation?.manualAdjustments ?? 0;
  const prevFinalScore = existingEvaluation?.finalScore ?? (prevRound1Score + prevRound2Score + prevManualAdjustments);

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

  await (prisma.scoreAdjustment.create as any)({
    data: {
      participantId,
      adminId,
      round1Score: normalizedRound1Score,
      round2Score: normalizedRound2Score,
      manualAdjustments: normalizedManualAdjustments,
      finalScore,
      previousRound1Score: prevRound1Score,
      previousRound2Score: prevRound2Score,
      previousManualAdjustments: prevManualAdjustments,
      previousFinalScore: prevFinalScore,
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
  const rawAdjustment = await prisma.scoreAdjustment.findUnique({
    where: { id: adjustmentId },
  });
  const adjustment = rawAdjustment as unknown as ScoreAdjustmentRecord | null;

  if (!adjustment || adjustment.reversedAt) {
    throw new AppError(404, 'Active score adjustment not found');
  }

  const existingEvaluation = await prisma.evaluation.findUnique({
    where: { participantId: adjustment.participantId },
  });

  if (existingEvaluation?.lockedAt) {
    throw new AppError(409, 'Evaluation is locked');
  }

  const reversed = await prisma.scoreAdjustment.update({
    where: { id: adjustment.id },
    data: { reversedAt: new Date(), reversedBy: adminId },
  });

  // Calculate new score state based on remaining active adjustments or pre-adjustment state
  const rawRemaining = await prisma.scoreAdjustment.findMany({
    where: {
      participantId: adjustment.participantId,
      reversedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });
  const remainingActiveAdjustments = rawRemaining as unknown as ScoreAdjustmentRecord[];

  let newRound1Score: number;
  let newRound2Score: number;
  let newManualAdjustments: number;
  let newFinalScore: number;

  if (remainingActiveAdjustments.length > 0) {
    // If the reversed adjustment was the latest, restore to the latest remaining active adjustment
    const latestRemaining = remainingActiveAdjustments[0];
    if (new Date(adjustment.createdAt).getTime() >= new Date(latestRemaining.createdAt).getTime()) {
      newRound1Score = latestRemaining.round1Score;
      newRound2Score = latestRemaining.round2Score;
      newManualAdjustments = latestRemaining.manualAdjustments;
      newFinalScore = latestRemaining.finalScore;
    } else {
      // Reversing an earlier adjustment while subsequent adjustments exist:
      // Subtract the delta introduced by this adjustment
      const deltaR1 = adjustment.round1Score - (adjustment.previousRound1Score ?? 0);
      const deltaR2 = adjustment.round2Score - (adjustment.previousRound2Score ?? 0);
      const deltaManual = adjustment.manualAdjustments - (adjustment.previousManualAdjustments ?? 0);

      newRound1Score = (existingEvaluation?.round1Score ?? 0) - deltaR1;
      newRound2Score = (existingEvaluation?.round2Score ?? 0) - deltaR2;
      newManualAdjustments = (existingEvaluation?.manualAdjustments ?? 0) - deltaManual;
      newFinalScore = newRound1Score + newRound2Score + newManualAdjustments;
    }
  } else {
    // No remaining active adjustments:
    // Restore the state that existed before this adjustment
    if (adjustment.previousRound1Score !== null && adjustment.previousRound1Score !== undefined) {
      newRound1Score = adjustment.previousRound1Score;
      newRound2Score = adjustment.previousRound2Score ?? 0;
      newManualAdjustments = adjustment.previousManualAdjustments ?? 0;
      newFinalScore = adjustment.previousFinalScore ?? (newRound1Score + newRound2Score + newManualAdjustments);
    } else {
      // Fallback if previous* was not recorded:
      // Revert manual adjustment delta while preserving base round scores
      newRound1Score = existingEvaluation?.round1Score ?? 0;
      newRound2Score = existingEvaluation?.round2Score ?? 0;
      newManualAdjustments = 0;
      newFinalScore = newRound1Score + newRound2Score;
    }
  }

  const evaluation = await prisma.evaluation.update({
    where: { participantId: adjustment.participantId },
    data: {
      round1Score: newRound1Score,
      round2Score: newRound2Score,
      manualAdjustments: newManualAdjustments,
      finalScore: newFinalScore,
    },
  });

  await syncLeaderboardScore(adjustment.participantId, newFinalScore);

  await recordAuditLog(
    adminId,
    'SCORE_ADJUSTMENT',
    `Score adjustment ${adjustment.id} reversed for participant ${adjustment.participantId}`
  );

  return { evaluation, adjustment: reversed };
}

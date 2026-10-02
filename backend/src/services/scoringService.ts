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
  manualAdjustments?: number;
  judgeComments?: string;
  reason?: string;
}

const MANUAL_ADJ_MIN    = -500;
const MANUAL_ADJ_MAX    = 500;
const QUALITY_MIN       = 0;
const QUALITY_MAX       = 100;
const MAX_ROUND_SCORE   = 10_000;
const MAX_TIE_BREAK_MS  = 2_147_483_647;

/**
 * ACCEPTED awards full problem points. PARTIAL awards
 * floor(points * passedCases / totalCases). Compile errors, runtime errors,
 * time-limit errors, output-limit errors, and wrong answers award zero.
 * Compiler time and execution time are never scoring factors.
 */
export function calculateProblemPoints(points: number, status: string, passedCases: number, totalCases: number) {
  if (status === 'ACCEPTED') return points;
  if (status !== 'PARTIAL' || totalCases <= 0) return 0;
  return Math.floor(points * Math.max(0, Math.min(passedCases, totalCases)) / totalCases);
}

export async function recordSubmissionScore(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { problem: { select: { id: true, points: true, roundId: true, round: { select: { roundType: true, startTime: true } } } } },
  });
  const scoredStatuses = ['ACCEPTED', 'PARTIAL', 'WRONG_ANSWER', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'OUTPUT_LIMIT_EXCEEDED'];
  if (!submission || !scoredStatuses.includes(submission.status)) return;

  const roundType = submission.problem.round.roundType;
  if (roundType !== 'CODE_RUN' && roundType !== 'CODE_IN_DARK') return;

  const attempts = await prisma.submission.findMany({
    where: {
      participantId: submission.participantId,
      problem: { round: { roundType: { in: ['CODE_RUN', 'CODE_IN_DARK'] } } },
      status: { in: scoredStatuses },
    },
    include: { problem: { select: { id: true, points: true, round: { select: { roundType: true, startTime: true, readingPeriodSeconds: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  // Best submission per problem: higher score wins; equal scores prefer the earlier
  // valid submission (createdAt vs round coding start). Execution/compile time is unused.
  const bestByProblem = new Map<string, { points: number; submissionTimeMs: number; roundType: string }>();
  for (const attempt of attempts) {
    const points = calculateProblemPoints(attempt.problem.points, attempt.status, attempt.passedCases, attempt.totalCases);
    if (points === 0) continue;
    const roundStart = attempt.problem.round.startTime?.getTime();
    const startedAt = roundStart === undefined
      ? undefined
      : roundStart + (attempt.problem.round.roundType === 'CODE_IN_DARK' ? attempt.problem.round.readingPeriodSeconds * 1000 : 0);
    const submissionTimeMs = startedAt === undefined
      ? MAX_TIE_BREAK_MS
      : Math.max(0, attempt.createdAt.getTime() - startedAt);
    const existing = bestByProblem.get(attempt.problemId);
    if (!existing || points > existing.points || (points === existing.points && submissionTimeMs < existing.submissionTimeMs)) {
      bestByProblem.set(attempt.problemId, { points, submissionTimeMs, roundType: attempt.problem.round.roundType });
    }
  }

  const bestResults = [...bestByProblem.values()];
  const round1Score = bestResults.filter((result) => result.roundType === 'CODE_RUN').reduce((sum, result) => sum + result.points, 0);
  const round2Score = bestResults.filter((result) => result.roundType === 'CODE_IN_DARK').reduce((sum, result) => sum + result.points, 0);
  const tieBreakTimeMs = bestResults.reduce((sum, result) => sum + result.submissionTimeMs, 0);
  const existingEvaluation = await prisma.evaluation.findUnique({ where: { participantId: submission.participantId } });
  if (existingEvaluation?.lockedAt) return;

  const roundScores = { round1Score, round2Score };
  const finalScore = round1Score + round2Score + (existingEvaluation?.manualAdjustments ?? 0);
  const evaluation = await prisma.evaluation.upsert({
    where: { participantId: submission.participantId },
    create: { participantId: submission.participantId, ...roundScores, tieBreakTimeMs, finalScore },
    update: { ...roundScores, tieBreakTimeMs, finalScore },
  });

  try {
    await syncLeaderboardScore(evaluation.participantId, evaluation.finalScore);
  } catch (error) {
    console.error('Could not sync automatic score to Redis leaderboard:', error);
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

  const finalScore = (existing?.round1Score ?? 0)
    + (existing?.round2Score ?? 0)
    + (existing?.manualAdjustments ?? 0);

  const evaluation = await prisma.evaluation.upsert({
    where: { participantId },
    update: { codeQuality: quality, logicClarity: clarity, judgeComments: input.judgeComments, finalScore },
    create: {
      participantId,
      codeQuality: quality,
      logicClarity: clarity,
      judgeComments: input.judgeComments,
      finalScore,
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

  const r1 = existingEvaluation?.round1Score ?? 0;
  const r2 = existingEvaluation?.round2Score ?? 0;
  const manual = input.manualAdjustments !== undefined
    ? Number(input.manualAdjustments)
    : (existingEvaluation?.manualAdjustments ?? 0);

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
        newFinal  = newR1 + newR2 + newManual;
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
      newFinal  = newR1 + newR2 + newManual;
    } else {
      newR1     = existingEvaluation?.round1Score  ?? 0;
      newR2     = existingEvaluation?.round2Score  ?? 0;
      newManual = 0;
      newFinal  = newR1 + newR2 + newManual;
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

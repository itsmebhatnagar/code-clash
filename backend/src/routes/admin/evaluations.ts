import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  listEvaluations,
  lockEvaluation,
  unlockEvaluation,
  updateJudgeEvaluation,
  adjustScore,
  getScoreHistory,
  reverseScoreAdjustment,
} from '../../services/scoringService';

export function createScoreRoutes() {
  const router = Router();

  router.post('/adjust', asyncHandler(async (req: any, res) => {
    const { participantId, round1Score, round2Score, manualAdjustments, judgeComments, reason } = req.body;
    const evaluation = await adjustScore(
      participantId,
      { round1Score, round2Score, manualAdjustments, judgeComments, reason },
      req.user.id
    );
    res.json(evaluation);
  }));

  router.get('/:participantId/history', asyncHandler(async (req, res) => {
    res.json(await getScoreHistory(req.params.participantId as string));
  }));

  router.post('/:adjustmentId/reverse', asyncHandler(async (req: any, res) => {
    const result = await reverseScoreAdjustment(req.params.adjustmentId as string, req.user.id);
    res.json(result);
  }));

  return router;
}

export default function createEvaluationRoutes() {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await listEvaluations());
  }));

  router.post('/:id/lock', asyncHandler(async (req: any, res) => {
    res.json(await lockEvaluation(req.params.id as string, req.user.id));
  }));

  router.post('/:id/unlock', asyncHandler(async (req: any, res) => {
    res.json(await unlockEvaluation(req.params.id as string, req.user.id));
  }));

  router.put('/:participantId', asyncHandler(async (req: any, res) => {
    const { codeQuality, logicClarity, judgeComments } = req.body;
    const evaluation = await updateJudgeEvaluation(
      req.params.participantId as string,
      { codeQuality, logicClarity, judgeComments },
      req.user.id
    );
    res.json(evaluation);
  }));

  router.use('/scores', createScoreRoutes());

  return router;
}

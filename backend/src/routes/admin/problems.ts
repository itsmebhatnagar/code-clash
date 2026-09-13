import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  listProblems,
  getProblemById,
  createProblem,
  updateProblem,
  deleteProblem,
  duplicateProblem,
  getProblemTestCases,
  addTestCase,
  getProblemExamples,
  addExample,
} from '../../services/contestService';

export default function createProblemRoutes() {
  const router = Router();

  router.post('/', asyncHandler(async (req: any, res) => {
    const problem = await createProblem(req.body, req.user.id);
    res.status(201).json(problem);
  }));

  router.put('/:id', asyncHandler(async (req: any, res) => {
    const problem = await updateProblem(req.params.id as string, req.body, req.user.id);
    res.json(problem);
  }));

  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await listProblems());
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await getProblemById(req.params.id as string));
  }));

  router.get('/:id/test-cases', asyncHandler(async (req, res) => {
    res.json(await getProblemTestCases(req.params.id as string));
  }));

  router.get('/:id/examples', asyncHandler(async (req, res) => {
    res.json(await getProblemExamples(req.params.id as string));
  }));

  router.delete('/:id', asyncHandler(async (req: any, res) => {
    await deleteProblem(req.params.id as string, req.user.id);
    res.status(204).send();
  }));

  router.post('/:id/duplicate', asyncHandler(async (req: any, res) => {
    const copy = await duplicateProblem(req.params.id as string, req.body.roundId, req.user.id);
    res.status(201).json(copy);
  }));

  router.post('/:id/test-cases', asyncHandler(async (req, res) => {
    const { input, output, isHidden } = req.body;
    const testCase = await addTestCase(req.params.id as string, input, output, isHidden);
    res.status(201).json(testCase);
  }));

  router.post('/:id/examples', asyncHandler(async (req, res) => {
    const { input, output, explanation } = req.body;
    const example = await addExample(req.params.id as string, input, output, explanation);
    res.status(201).json(example);
  }));

  return router;
}

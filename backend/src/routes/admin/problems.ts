import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  bulkImportProblems,
  listProblems,
  getProblemById,
  createProblem,
  updateProblem,
  deleteProblem,
  duplicateProblem,
  getProblemTestCases,
  addTestCase,
  updateTestCase,
  deleteTestCase,
  duplicateTestCase,
  getProblemExamples,
  addExample,
  updateExample,
  deleteExample,
  reorderExamples,
} from '../../services/contestService';

export default function createProblemRoutes() {
  const router = Router();

  router.post('/import', asyncHandler(async (req: any, res) => {
    res.status(201).json(await bulkImportProblems(req.body?.problems, req.user.id));
  }));

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
    const copy = await duplicateProblem(req.params.id as string, req.body?.roundId, req.user.id);
    res.status(201).json(copy);
  }));

  router.post('/:id/test-cases', asyncHandler(async (req: any, res) => {
    const { input, output, isHidden } = req.body;
    const testCase = await addTestCase(req.params.id as string, input, output, isHidden ?? true, req.user!.id);
    res.status(201).json(testCase);
  }));

  router.put('/:problemId/test-cases/:testCaseId', asyncHandler(async (req: any, res) => {
    res.json(await updateTestCase(req.params.problemId, req.params.testCaseId, req.body, req.user.id));
  }));

  router.delete('/:problemId/test-cases/:testCaseId', asyncHandler(async (req: any, res) => {
    await deleteTestCase(req.params.problemId, req.params.testCaseId, req.user.id);
    res.status(204).send();
  }));

  router.post('/:problemId/test-cases/:testCaseId/duplicate', asyncHandler(async (req: any, res) => {
    res.status(201).json(await duplicateTestCase(req.params.problemId, req.params.testCaseId, req.user.id));
  }));

  router.post('/:id/examples', asyncHandler(async (req: any, res) => {
    const { input, output, explanation } = req.body;
    const example = await addExample(req.params.id as string, input, output, explanation, req.user!.id);
    res.status(201).json(example);
  }));

  router.put('/:problemId/examples/reorder', asyncHandler(async (req: any, res) => {
    await reorderExamples(req.params.problemId, req.body.ids, req.user.id);
    res.status(204).send();
  }));

  router.put('/:problemId/examples/:exampleId', asyncHandler(async (req: any, res) => {
    res.json(await updateExample(req.params.problemId, req.params.exampleId, req.body, req.user.id));
  }));

  router.delete('/:problemId/examples/:exampleId', asyncHandler(async (req: any, res) => {
    await deleteExample(req.params.problemId, req.params.exampleId, req.user.id);
    res.status(204).send();
  }));

  return router;
}

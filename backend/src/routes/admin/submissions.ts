import { Router } from 'express';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/asyncHandler';
import { AppError } from '../../middleware/errorMiddleware';

export default function createSubmissionRoutes() {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const submissions = await prisma.submission.findMany({ where: { ...(req.query.participantId ? { participantId: String(req.query.participantId) } : {}), ...(req.query.problemId ? { problemId: String(req.query.problemId) } : {}), ...(req.query.status ? { status: String(req.query.status) } : {}) }, include: { participant: { select: { name: true, email: true } }, problem: { include: { round: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(submissions);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const submission = await prisma.submission.findUnique({ where: { id: req.params.id as string }, include: { participant: { select: { id: true, name: true, email: true, college: true, collegeId: true, status: true } }, problem: { include: { round: true } } } });
    if (!submission) throw new AppError(404, 'Submission not found');
    res.json(submission);
  }));

  return router;
}

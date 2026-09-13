import { Queue, QueueEvents } from 'bullmq';
import { connection } from './redis';

export const SUBMISSIONS_QUEUE = 'submissions';

export const submissionsQueue = new Queue(SUBMISSIONS_QUEUE, {
  connection,
  defaultJobOptions: {
    // Retry only applies to InfraError throws (DB/Docker transient failures).
    // Deterministic judging verdicts are persisted via finish() and the job
    // resolves successfully from BullMQ's perspective.
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,   // 2 s → 4 s → 8 s
    },
    removeOnComplete: true,
    removeOnFail: 1000,  // Keep last 1000 failed jobs for post-mortem
  },
});

export const submissionsQueueEvents = new QueueEvents(SUBMISSIONS_QUEUE, { connection });

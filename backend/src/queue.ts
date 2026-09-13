import { Queue, QueueEvents } from 'bullmq';
import { connection } from './redis';

export const SUBMISSIONS_QUEUE = 'submissions';

export const submissionsQueue = new Queue(SUBMISSIONS_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

export const submissionsQueueEvents = new QueueEvents(SUBMISSIONS_QUEUE, { connection });

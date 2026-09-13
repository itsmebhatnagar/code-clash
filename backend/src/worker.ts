import { Worker } from 'bullmq';
import { connection } from './redis';
import { judgeSubmission, InfraError } from './judgeWorker';
import { SUBMISSIONS_QUEUE } from './queue';
import dotenv from 'dotenv';

dotenv.config();

console.log(`Starting Judge Worker process for queue: ${SUBMISSIONS_QUEUE}...`);
console.log(`Requires Docker Sandbox: ${process.env.NODE_ENV === 'production' || process.env.JUDGE_REQUIRE_SANDBOX === 'true'}`);

const worker = new Worker(SUBMISSIONS_QUEUE, async (job) => {
  const { submissionId } = job.data;
  console.log(`Processing submission ${submissionId} (attempt ${job.attemptsMade + 1})`);

  try {
    const result = await judgeSubmission(submissionId);
    return result;
  } catch (err) {
    if (err instanceof InfraError) {
      // Transient infrastructure failure — let BullMQ retry with backoff.
      console.error(`[infra] Submission ${submissionId} will be retried: ${(err as Error).message}`);
      throw err;
    }
    // Any other unexpected error: log and rethrow so the job is marked failed
    // without consuming retry attempts (it won't self-heal from a logic bug).
    console.error(`[judge] Unexpected error for submission ${submissionId}:`, err);
    throw err;
  }
}, {
  connection,
  // Concurrency: process one job at a time per worker process so the
  // host's Docker daemon isn't overwhelmed.
  concurrency: 1,
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed (submission ${job.data.submissionId})`);
});

worker.on('failed', (job, err) => {
  const isInfra = err instanceof InfraError;
  console.error(
    `Job ${job?.id} failed${isInfra ? ' [infra – will retry]' : ' [final]'}: ${err.message}`
  );
});

process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});

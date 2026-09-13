import { Worker } from 'bullmq';
import { connection } from './redis';
import { judgeSubmission } from './judgeWorker';
import { SUBMISSIONS_QUEUE } from './queue';
import dotenv from 'dotenv';

dotenv.config();

console.log(`Starting Judge Worker process for queue: ${SUBMISSIONS_QUEUE}...`);
console.log(`Requires Docker Sandbox: ${process.env.NODE_ENV === 'production' || process.env.JUDGE_REQUIRE_SANDBOX === 'true'}`);

const worker = new Worker(SUBMISSIONS_QUEUE, async (job) => {
  const { submissionId } = job.data;
  console.log(`Processing submission ${submissionId}`);
  const result = await judgeSubmission(submissionId);
  return result;
}, { connection });

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with ${err.message}`);
});

process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = isProduction ? configuredOrigins : [...configuredOrigins, 'http://localhost:3000'];

if (isProduction && allowedOrigins.length === 0) {
  throw new Error('FRONTEND_URL is not configured');
}

const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
});

import createAuthRouter from './routes/auth';
import createAdminRouter from './routes/admin';
import createContestRouter from './routes/contest';
import leaderboardRoutes from './routes/leaderboard';
import { setupSockets } from './sockets';
import { errorMiddleware } from './middleware/errorMiddleware';
import bcrypt from 'bcrypt';
import { prisma } from './db';
import { rateLimit } from './middleware/rateLimit';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

app.use('/api/auth', rateLimit(15 * 60_000, 100), createAuthRouter(io));
app.use('/api/admin', createAdminRouter(io));
app.use('/api/contest', createContestRouter(io));
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Code Clash Backend is running' });
});

import { submissionsQueueEvents } from './queue';

submissionsQueueEvents.on('completed', async ({ jobId, returnvalue }) => {
  if (returnvalue && typeof returnvalue === 'object' && 'participantId' in returnvalue) {
    io.to(`PARTICIPANT:${returnvalue.participantId}`).emit('SUBMISSION_RESULT', returnvalue);
  }
});

submissionsQueueEvents.on('failed', async ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed with reason: ${failedReason}`);
});

setupSockets(io);

app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

async function ensureAdminAccount() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    if (isProduction) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required in production');
    return;
  }
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true, passwordHash: true, role: true, name: true, status: true } });
  if (existingAdmin) {
    if (existingAdmin.role !== 'ADMIN') {
      await prisma.user.update({ where: { id: existingAdmin.id }, data: { role: 'ADMIN' } });
    }
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'ADMIN' },
    create: { name: 'Code Clash Admin', email: ADMIN_EMAIL, passwordHash, role: 'ADMIN', status: 'REGISTERED' },
  });
}

async function startServer() {
  await ensureAdminAccount();

  try {
    const { syncLeaderboardScore } = await import('./redis');
    const evaluations = await prisma.evaluation.findMany({ select: { participantId: true, finalScore: true } });
    for (const ev of evaluations) {
      await syncLeaderboardScore(ev.participantId, ev.finalScore);
    }
    console.log(`Synced ${evaluations.length} evaluation scores to Redis leaderboard`);
  } catch (err) {
    console.error('Failed to sync leaderboard to Redis on startup', err);
  }

  httpServer.listen(PORT, () => {
    console.log(`Code Clash Backend is running on port ${PORT}`);
  });
}

void startServer().catch((error) => {
  console.error('Failed to initialize the admin account', error);
  process.exitCode = 1;
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down backend`);
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

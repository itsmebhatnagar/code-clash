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

const ADMIN_EMAIL = 'codeclash@admin.com';
const ADMIN_PASSWORD = 'codeCLASHadmin';

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', createAuthRouter(io));
app.use('/api/admin', createAdminRouter(io));
app.use('/api/contest', createContestRouter(io));
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Code Clash Backend is running' });
});

// Real-time socket connections for Judge-Authoritative Clock
setupSockets(io);

app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

async function ensureAdminAccount() {
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true, passwordHash: true, role: true, name: true, status: true } });
  if (existingAdmin && await bcrypt.compare(ADMIN_PASSWORD, existingAdmin.passwordHash)) {
    if (existingAdmin.role === 'ADMIN' && existingAdmin.name === 'Code Clash Admin' && existingAdmin.status === 'REGISTERED') return;
    await prisma.user.update({ where: { id: existingAdmin.id }, data: { name: 'Code Clash Admin', role: 'ADMIN', status: 'REGISTERED' } });
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { name: 'Code Clash Admin', passwordHash, role: 'ADMIN', status: 'REGISTERED' },
    create: { name: 'Code Clash Admin', email: ADMIN_EMAIL, passwordHash, role: 'ADMIN', status: 'REGISTERED' },
  });
}

async function startServer() {
  await ensureAdminAccount();

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

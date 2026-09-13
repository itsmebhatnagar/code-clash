
import express, { Express } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import Module from 'module';

process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET    = 'test-jwt-secret';
process.env.NODE_ENV      = 'test';

export const prisma = new PrismaClient();

const store = new Map<string, string>();
export const redisMock = {
  _store: store,
  get:     async (k: string)                => store.get(k) ?? null,
  set:     async (k: string, v: string)     => { store.set(k, v); return 'OK' as const; },
  del:     async (k: string)                => { const had = store.has(k); store.delete(k); return had ? 1 : 0; },
  zadd:    async ()                         => 0,
  zrevrank:async ()                         => null,
  zrem:    async ()                         => 0,
  on:      (_: string, __: Function)        => redisMock,
};

const _origLoad = (Module as any)._load.bind(Module);
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (/[/\\]redis(\.js|\.ts)?$/.test(request) || request.endsWith('/redis')) {
    return {
      connection: redisMock,
      LEADERBOARD_KEY: 'global_leaderboard',
      syncLeaderboardScore: async () => {},
      getParticipantRank:   async () => null,
      removeParticipantFromLeaderboard: async () => {},
    };
  }
  if (/[/\\]queue(\.js|\.ts)?$/.test(request) || request.endsWith('/queue')) {
    return {
      submissionsQueue:       { add: async () => {} },
      submissionsQueueEvents: { on: () => {} },
    };
  }
  return _origLoad(request, parent, isMain);
};

let _app: Express | null = null;

export async function getApp(): Promise<Express> {
  if (_app) return _app;

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  const io = new Server(createServer(app));

  const { default: createAuthRouter }   = await import('../src/routes/auth');
  const { default: createAdminRouter }  = await import('../src/routes/admin');
  const { default: createContestRouter }= await import('../src/routes/contest');
  const { default: leaderboardRoutes }  = await import('../src/routes/leaderboard');
  const { errorMiddleware }             = await import('../src/middleware/errorMiddleware');

  app.use('/api/auth',        createAuthRouter(io));
  app.use('/api/admin',       createAdminRouter(io));
  app.use('/api/contest',     createContestRouter(io));
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use(errorMiddleware);

  _app = app;
  return app;
}

export function signToken(payload: { id: string; role: string }, opts: jwt.SignOptions = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '15m',
    issuer:    'code-clash',
    audience:  'code-clash-frontend',
    ...opts,
  });
}

export function expiredToken(payload: { id: string; role: string }) {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '-1s',
    issuer:    'code-clash',
    audience:  'code-clash-frontend',
  });
}

export async function seedParticipant(overrides: {
  name?: string; email?: string; password?: string; status?: string; role?: string;
} = {}) {
  return prisma.user.create({
    data: {
      name:         overrides.name     ?? 'Test Participant',
      email:        overrides.email    ?? `p-${Date.now()}-${Math.random()}@test.com`,
      passwordHash: await bcrypt.hash(overrides.password ?? 'password123', 4),
      role:         overrides.role     ?? 'PARTICIPANT',
      status:       overrides.status   ?? 'REGISTERED',
    },
  });
}

export async function seedAdmin(email?: string) {
  return prisma.user.create({
    data: {
      name:         'Test Admin',
      email:        email ?? `admin-${Date.now()}@test.com`,
      passwordHash: await bcrypt.hash('adminpass', 4),
      role:         'ADMIN',
      status:       'REGISTERED',
    },
  });
}

export async function seedRoundWithProblem(status = 'ACTIVE') {
  const round = await prisma.round.create({
    data: { name: `Round-${Date.now()}`, duration: 60, status },
  });
  const problem = await prisma.problem.create({
    data: {
      title:        'Hello World',
      description:  'Print hello',
      inputFormat:  'None',
      outputFormat: '"hello"',
      constraints:  'None',
      difficulty:   'EASY',
      timeLimit:    2000,
      memoryLimit:  128,
      roundId:      round.id,
    },
  });
  await prisma.testCase.create({
    data: { problemId: problem.id, input: '', output: 'hello', isHidden: false },
  });
  return { round, problem };
}

export async function cleanDb() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  try {
    await prisma.authLog.deleteMany();
    await prisma.scoreAdjustment.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.evaluation.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.problemExample.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.workstationAssignmentHistory.deleteMany();
    await prisma.workstation.deleteMany();
    await prisma.participantStatusHistory.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.round.deleteMany();
    await prisma.user.deleteMany();
  } finally {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  }
  store.clear();
}

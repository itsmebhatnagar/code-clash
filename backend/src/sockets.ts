import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from './db';
import { getAdminMetrics, markParticipantConnected, markParticipantDisconnected } from './presence';
import { recordAuditLog } from './audit';

const JWT_SECRET = process.env.JWT_SECRET;
const roundTimers = new Map<string, NodeJS.Timeout>();

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured');
}

export const setupSockets = (io: Server) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (typeof decoded === 'string' || typeof decoded.id !== 'string') {
        return next(new Error('Authentication error: Invalid token'));
      }
      void prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, role: true } }).then((user) => {
        if (!user) {
          next(new Error('Authentication error: User not found'));
          return;
        }
        socket.data.user = user;
        next();
      }).catch(() => next(new Error('Authentication error: User lookup failed')));
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    console.log(`User connected: ${user.id} (${user.role})`);
    socket.join(user.role);
    socket.join(`PARTICIPANT:${user.id}`);

    if (user.role === 'PARTICIPANT') {
      markParticipantConnected(user.id);
      void broadcastAdminMetrics(io);
    }
    if (user.role === 'ADMIN') void broadcastAdminMetrics(io, socket);

    socket.emit('SYNC_TIME', { serverTime: Date.now() });

    if (user.role === 'ADMIN') {
      socket.on('START_ROUND', async (data: { roundId: string }) => {
        try {
          await assertCurrentAdmin(user.id);
          const round = await prisma.$transaction(async (transaction) => {
            const target = await transaction.round.findUnique({ where: { id: data.roundId } });
            if (!target) throw new Error('ROUND_NOT_FOUND');
            if (target.status !== 'PENDING') throw new Error('ROUND_CANNOT_START');

            const activeRound = await transaction.round.findFirst({ where: { status: 'ACTIVE' } });
            if (activeRound) throw new Error('ANOTHER_ROUND_ACTIVE');

            return transaction.round.update({
              where: { id: target.id },
              data: { status: 'ACTIVE', startTime: new Date(), endTime: null }
            });
          });

          io.emit('ROUND_STATE_UPDATE', { 
            roundId: round.id, 
            status: 'ACTIVE', 
            startTime: round.startTime,
            duration: round.duration
          });
          await recordAuditLog(user.id, 'ROUND_START', `Round ${round.id} (${round.name}) started`);
          scheduleRoundEnd(io, round.id, round.duration * 60_000);
        } catch (error) {
          socket.emit('ERROR', { message: roundErrorMessage(error, 'Failed to start round') });
        }
      });

      socket.on('PAUSE_ROUND', async (data: { roundId: string }) => {
        try {
          await assertCurrentAdmin(user.id);
          const round = await transitionRound(data.roundId, 'ACTIVE', 'PAUSED');
          clearRoundTimer(round.id);
          io.emit('ROUND_STATE_UPDATE', { roundId: round.id, status: 'PAUSED' });
          await recordAuditLog(user.id, 'ROUND_PAUSE', `Round ${round.id} (${round.name}) paused`);
        } catch (error) {
          socket.emit('ERROR', { message: roundErrorMessage(error, 'Failed to pause round') });
        }
      });

      socket.on('RESUME_ROUND', async (data: { roundId: string }) => {
        try {
          await assertCurrentAdmin(user.id);
          const round = await transitionRound(data.roundId, 'PAUSED', 'ACTIVE');
          const elapsed = round.startTime ? Date.now() - round.startTime.getTime() : 0;
          scheduleRoundEnd(io, round.id, Math.max(round.duration * 60_000 - elapsed, 1_000));
          io.emit('ROUND_STATE_UPDATE', { roundId: round.id, status: 'ACTIVE', startTime: round.startTime, duration: round.duration });
          await recordAuditLog(user.id, 'ROUND_START', `Round ${round.id} (${round.name}) resumed`);
        } catch (error) {
          socket.emit('ERROR', { message: roundErrorMessage(error, 'Failed to resume round') });
        }
      });

      socket.on('END_ROUND', async (data: { roundId: string }) => {
        try {
          await assertCurrentAdmin(user.id);
          const round = await transitionRound(data.roundId, ['ACTIVE', 'PAUSED'], 'ENDED');
          clearRoundTimer(round.id);
          io.emit('ROUND_STATE_UPDATE', { roundId: round.id, status: 'ENDED' });
          io.to('PARTICIPANT').emit('FORCE_SUBMIT', { roundId: round.id });
          await recordAuditLog(user.id, 'ROUND_END', `Round ${round.id} (${round.name}) ended`);
        } catch (error) {
          socket.emit('ERROR', { message: roundErrorMessage(error, 'Failed to end round') });
        }
      });
    }

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${user.id}`);
      if (user.role === 'PARTICIPANT') {
        markParticipantDisconnected(user.id);
        void broadcastAdminMetrics(io);
      }
    });
  });

  void restoreActiveRoundTimers(io).catch((error) => {
    console.error('Failed to restore active round timers:', error);
  });
};

async function restoreActiveRoundTimers(io: Server) {
  const activeRounds = await prisma.round.findMany({ where: { status: 'ACTIVE' }, select: { id: true, startTime: true, duration: true } });
  for (const round of activeRounds) {
    const elapsed = round.startTime ? Date.now() - round.startTime.getTime() : 0;
    scheduleRoundEnd(io, round.id, Math.max(round.duration * 60_000 - elapsed, 1_000));
  }
}

async function broadcastAdminMetrics(io: Server, socket?: Socket) {
  const metrics = await getAdminMetrics();
  if (socket) socket.emit('ADMIN_METRICS_UPDATE', metrics);
  else io.to('ADMIN').emit('ADMIN_METRICS_UPDATE', metrics);
}

async function assertCurrentAdmin(userId: string) {
  const admin = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!admin || admin.role !== 'ADMIN') throw new Error('ADMIN_NOT_AUTHORIZED');
}

async function transitionRound(roundId: string, allowedStatuses: string | string[], nextStatus: string) {
  const allowed = Array.isArray(allowedStatuses) ? allowedStatuses : [allowedStatuses];
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new Error('ROUND_NOT_FOUND');
  if (!allowed.includes(round.status)) throw new Error('ROUND_INVALID_TRANSITION');

  const resumedStartTime = nextStatus === 'ACTIVE' && round.status === 'PAUSED' && round.pausedAt && round.startTime
    ? new Date(round.startTime.getTime() + (Date.now() - round.pausedAt.getTime()))
    : round.startTime;
  return prisma.round.update({
    where: { id: round.id },
    data: { status: nextStatus, startTime: resumedStartTime, pausedAt: nextStatus === 'PAUSED' ? new Date() : null, endTime: nextStatus === 'ENDED' ? new Date() : round.endTime }
  });
}

function clearRoundTimer(roundId: string) {
  const timer = roundTimers.get(roundId);
  if (timer) clearTimeout(timer);
  roundTimers.delete(roundId);
}

function scheduleRoundEnd(io: Server, roundId: string, delay: number) {
  clearRoundTimer(roundId);
  roundTimers.set(roundId, setTimeout(async () => {
    try {
      const round = await transitionRound(roundId, 'ACTIVE', 'ENDED');
      io.emit('ROUND_STATE_UPDATE', { roundId: round.id, status: 'ENDED', automatic: true });
      io.to('PARTICIPANT').emit('FORCE_SUBMIT', { roundId: round.id, automatic: true });
    } catch (error) {
      console.error('Automatic round end failed:', error);
    } finally {
      roundTimers.delete(roundId);
    }
  }, delay));
}

function roundErrorMessage(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    ADMIN_NOT_AUTHORIZED: 'Admin authorization is no longer valid',
    ROUND_NOT_FOUND: 'Round does not exist',
    ROUND_CANNOT_START: 'Only a pending round can be started',
    ANOTHER_ROUND_ACTIVE: 'Another round is already active',
    ROUND_INVALID_TRANSITION: 'Round cannot transition from its current state'
  };
  return messages[code] || fallback;
}

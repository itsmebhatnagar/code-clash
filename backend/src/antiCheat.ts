import { prisma } from './db';
import crypto from 'crypto';

const RAPID_RECONNECT_THRESHOLD = 30_000; // 30 seconds
const MULTIPLE_SESSION_THRESHOLD = 2;

export function generateDeviceFingerprint(userAgent: string, ip: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(userAgent || '');
  hash.update(ip || '');
  return hash.digest('hex').substring(0, 32);
}

export async function trackSessionConnection(
  participantId: string,
  socketId: string,
  ip: string | undefined,
  userAgent: string | undefined
) {
  const deviceFingerprint = generateDeviceFingerprint(userAgent || '', ip || '');
  
  const existingSessions = await prisma.participantSession.findMany({
    where: {
      participantId,
      disconnectedAt: null
    }
  });

  const flags: string[] = [];
  
  if (existingSessions.length >= MULTIPLE_SESSION_THRESHOLD) {
    flags.push('multiple_sessions');
  }

  const recentDisconnect = await prisma.participantSession.findFirst({
    where: {
      participantId,
      disconnectedAt: {
        gte: new Date(Date.now() - RAPID_RECONNECT_THRESHOLD)
      }
    },
    orderBy: { disconnectedAt: 'desc' }
  });

  if (recentDisconnect) {
    flags.push('rapid_reconnect');
  }

  const session = await prisma.participantSession.create({
    data: {
      participantId,
      sessionId: socketId,
      ipAddress: ip,
      deviceFingerprint,
      userAgent,
      suspiciousActivity: flags.length > 0,
      activityFlags: flags.length > 0 ? JSON.stringify(flags) : null
    }
  });

  return { session, flags };
}

export async function trackSessionDisconnection(
  participantId: string,
  socketId: string,
  reason?: string
) {
  await prisma.participantSession.updateMany({
    where: {
      participantId,
      sessionId: socketId,
      disconnectedAt: null
    },
    data: {
      disconnectedAt: new Date(),
      disconnectReason: reason || 'socket_disconnect'
    }
  });
}

export async function updateSessionActivity(participantId: string, socketId: string) {
  await prisma.participantSession.updateMany({
    where: {
      participantId,
      sessionId: socketId,
      disconnectedAt: null
    },
    data: {
      lastActivity: new Date()
    }
  });
}

export async function getSuspiciousParticipants() {
  const sessions = await prisma.participantSession.findMany({
    where: {
      suspiciousActivity: true,
      disconnectedAt: null
    },
    orderBy: { connectedAt: 'desc' }
  });

  const participantIds = [...new Set(sessions.map((s) => s.participantId))];
  const participants = await prisma.user.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, name: true, email: true, status: true }
  });
  const participantMap = new Map(participants.map((p) => [p.id, p]));

  return sessions.map((s) => ({
    ...s,
    participant: participantMap.get(s.participantId) || null
  }));
}

export async function getParticipantSessions(participantId: string) {
  return prisma.participantSession.findMany({
    where: { participantId },
    orderBy: { connectedAt: 'desc' },
    take: 20
  });
}

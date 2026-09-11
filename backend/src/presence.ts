import { prisma } from './db';
const participantConnections = new Map<string, number>();

export function markParticipantConnected(participantId: string) {
  participantConnections.set(participantId, (participantConnections.get(participantId) || 0) + 1);
}

export function markParticipantDisconnected(participantId: string) {
  const connections = (participantConnections.get(participantId) || 1) - 1;
  if (connections <= 0) participantConnections.delete(participantId);
  else participantConnections.set(participantId, connections);
}

export async function getAdminMetrics() {
  const [totalParticipants, registered, checkedIn, active, completed, disqualified, activeRound, activeRoundSubmitters, acceptedSolutions] = await Promise.all([
    prisma.user.count({ where: { role: 'PARTICIPANT' } }),
    prisma.user.count({ where: { role: 'PARTICIPANT', status: 'REGISTERED' } }),
    prisma.user.count({ where: { role: 'PARTICIPANT', status: 'CHECKED_IN' } }),
    prisma.user.count({ where: { role: 'PARTICIPANT', status: { in: ['REGISTERED', 'CHECKED_IN'] } } }),
    prisma.user.count({ where: { role: 'PARTICIPANT', status: 'COMPLETED' } }),
    prisma.user.count({ where: { role: 'PARTICIPANT', status: 'DISQUALIFIED' } }),
    prisma.round.findFirst({ where: { status: 'ACTIVE' }, select: { id: true, name: true, startTime: true, duration: true } }),
    prisma.submission.findMany({
      where: { problem: { round: { status: 'ACTIVE' } } },
      select: { participantId: true },
      distinct: ['participantId']
    }),
    prisma.submission.count({ where: { status: 'ACCEPTED', problem: { round: { status: 'ACTIVE' } } } })
  ]);

  const connected = participantConnections.size;
  return {
    totalParticipants,
    registered,
    checkedIn,
    active,
    completed,
    disqualified,
    connected,
    inContest: activeRound ? connected : 0,
    currentRoundId: activeRound?.id || null,
    submitted: activeRound ? activeRoundSubmitters.length : 0,
    acceptedSolutions,
    disconnected: Math.max(totalParticipants - connected, 0),
    currentRound: activeRound?.name || null,
    liveContestStatus: activeRound ? 'ACTIVE' : 'IDLE',
    countdownSeconds: activeRound?.startTime ? Math.max(activeRound.duration * 60 - Math.floor((Date.now() - activeRound.startTime.getTime()) / 1000), 0) : 0
  };
}

export function getConnectedParticipantIds() {
  return Array.from(participantConnections.keys());
}

import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export const LEADERBOARD_KEY = 'global_leaderboard';

export async function syncLeaderboardScore(participantId: string, score: number) {
  await connection.zadd(LEADERBOARD_KEY, score, participantId);
}

export async function getParticipantRank(participantId: string): Promise<number | null> {
  const rank = await connection.zrevrank(LEADERBOARD_KEY, participantId);
  return rank !== null ? rank + 1 : null;
}

export async function removeParticipantFromLeaderboard(participantId: string) {
  await connection.zrem(LEADERBOARD_KEY, participantId);
}

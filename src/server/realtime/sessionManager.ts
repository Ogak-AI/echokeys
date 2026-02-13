import { getRedisClient } from './redisClient';

export type Session = {
  sessionId: string;
  playerId: string;
  username: string;
  verseId: string;
  verseText: string;
  currentText?: string;
  wpm?: number;
  accuracy?: number;
  startedAt?: number;
  isPublic?: boolean;
  spectatorCount?: number;
};

const SESSION_KEY = (id: string) => `keyscripture:session:${id}`;

export async function saveSession(session: Session) {
  const client = await getRedisClient();
  const payload = { ...session } as any;
  if (payload.startedAt) payload.startedAt = String(payload.startedAt);
  await client.hSet(SESSION_KEY(session.sessionId), payload as any);
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const client = await getRedisClient();
  const data = await client.hGetAll(SESSION_KEY(sessionId));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    sessionId,
    playerId: data.playerId,
    username: data.username,
    verseId: data.verseId,
    verseText: data.verseText,
    currentText: data.currentText,
    wpm: data.wpm ? Number(data.wpm) : undefined,
    accuracy: data.accuracy ? Number(data.accuracy) : undefined,
    startedAt: data.startedAt ? Number(data.startedAt) : undefined,
    isPublic: data.isPublic === 'true',
    spectatorCount: data.spectatorCount ? Number(data.spectatorCount) : 0,
  };
}

export async function deleteSession(sessionId: string) {
  const client = await getRedisClient();
  await client.del(SESSION_KEY(sessionId));
}

export async function incrSpectatorCount(sessionId: string): Promise<number> {
  const client = await getRedisClient();
  const key = SESSION_KEY(sessionId);
  const val = await client.hIncrBy(key, 'spectatorCount', 1);
  return val as number;
}

export async function decrSpectatorCount(sessionId: string): Promise<number> {
  const client = await getRedisClient();
  const key = SESSION_KEY(sessionId);
  const val = await client.hIncrBy(key, 'spectatorCount', -1);
  return Math.max(0, val as number);
}

export async function setSessionTTL(sessionId: string, seconds: number) {
  const client = await getRedisClient();
  await client.expire(SESSION_KEY(sessionId), seconds);
}

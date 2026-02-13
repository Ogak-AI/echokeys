/**
 * Session manager using Devvit KV storage
 * Stores game sessions and tracks active public games
 */

import { Context } from '@devvit/public-api';

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

const SESSION_KEY = (id: string) => `session:${id}`;
const ACTIVE_KEY = (id: string) => `active:${id}`;

export async function saveSession(context: Context, session: Session) {
  const ttl = 60 * 60; // 1 hour TTL
  await context.kv.put(SESSION_KEY(session.sessionId), JSON.stringify(session), { expiration: ttl });
}

export async function getSession(context: Context, sessionId: string): Promise<Session | null> {
  const data = await context.kv.get(SESSION_KEY(sessionId));
  return data ? JSON.parse(data) : null;
}

export async function deleteSession(context: Context, sessionId: string) {
  await context.kv.delete(SESSION_KEY(sessionId));
  await context.kv.delete(ACTIVE_KEY(sessionId));
}

export async function markSessionActive(context: Context, sessionId: string) {
  const ttl = 60 * 60; // 1 hour TTL
  await context.kv.put(ACTIVE_KEY(sessionId), JSON.stringify({ activeAt: Date.now() }), { expiration: ttl });
}

export async function getActiveSessions(context: Context): Promise<Session[]> {
  const keys = await context.kv.list({ prefix: 'session:' });
  const sessions: Session[] = [];

  for (const key of keys) {
    const sessionId = key.key.replace('session:', '');
    const session = await getSession(context, sessionId);
    if (session && session.isPublic) {
      sessions.push(session);
    }
  }

  return sessions;
}

export async function incrSpectatorCount(context: Context, sessionId: string): Promise<number> {
  const session = await getSession(context, sessionId);
  if (!session) return 0;
  const newCount = (session.spectatorCount || 0) + 1;
  await saveSession(context, { ...session, spectatorCount: newCount });
  return newCount;
}

export async function decrSpectatorCount(context: Context, sessionId: string): Promise<number> {
  const session = await getSession(context, sessionId);
  if (!session) return 0;
  const newCount = Math.max(0, (session.spectatorCount || 0) - 1);
  await saveSession(context, { ...session, spectatorCount: newCount });
  return newCount;
}

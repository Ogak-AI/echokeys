/**
 * Realtime event broadcaster using Devvit context.realtime
 * Handles game event distribution to spectators
 */

import { Context } from '@devvit/public-api';

type RealtimeEvent =
  | { type: 'GAME_STARTED'; sessionId: string; username: string; verseText: string; startedAt: number }
  | { type: 'PLAYER_PROGRESS'; sessionId: string; currentText: string; wpm: number; accuracy: number; elapsedTime: number }
  | { type: 'GAME_ENDED'; sessionId: string; finalWpm: number; finalAccuracy: number; totalTime: number };

const CHANNEL_FOR = (sessionId: string) => `session:${sessionId}`;

export async function publishGameStarted(
  context: Context,
  sessionId: string,
  payload: { username: string; verseText: string; startedAt: number }
) {
  const event: RealtimeEvent = {
    type: 'GAME_STARTED',
    sessionId,
    username: payload.username,
    verseText: payload.verseText,
    startedAt: payload.startedAt,
  };
  await context.realtime.send(CHANNEL_FOR(sessionId), JSON.stringify(event));
  // Also broadcast to lobby
  await context.realtime.send('lobby', JSON.stringify({ type: 'LOBBY_UPDATE' }));
}

export async function publishPlayerProgress(
  context: Context,
  sessionId: string,
  payload: { currentText: string; wpm: number; accuracy: number; elapsedTime: number }
) {
  const event: RealtimeEvent = {
    type: 'PLAYER_PROGRESS',
    sessionId,
    currentText: payload.currentText,
    wpm: payload.wpm,
    accuracy: payload.accuracy,
    elapsedTime: payload.elapsedTime,
  };
  await context.realtime.send(CHANNEL_FOR(sessionId), JSON.stringify(event));
}

export async function publishGameEnded(
  context: Context,
  sessionId: string,
  payload: { finalWpm: number; finalAccuracy: number; totalTime: number }
) {
  const event: RealtimeEvent = {
    type: 'GAME_ENDED',
    sessionId,
    finalWpm: payload.finalWpm,
    finalAccuracy: payload.finalAccuracy,
    totalTime: payload.totalTime,
  };
  await context.realtime.send(CHANNEL_FOR(sessionId), JSON.stringify(event));
  // Broadcast lobby update
  await context.realtime.send('lobby', JSON.stringify({ type: 'LOBBY_UPDATE' }));
}

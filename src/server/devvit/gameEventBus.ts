/**
 * Game event bus for Devvit
 * High-level API to manage game lifecycle
 */

import { Context } from '@devvit/public-api';
import { saveSession, deleteSession, markSessionActive, Session, incrSpectatorCount, decrSpectatorCount } from './sessionManager';
import { publishGameStarted, publishPlayerProgress, publishGameEnded } from './realtimeBroadcaster';

export async function createGameSession(
  context: Context,
  sessionId: string,
  session: Session
) {
  await saveSession(context, session);
  await markSessionActive(context, sessionId);
  await publishGameStarted(context, sessionId, {
    username: session.username,
    verseText: session.verseText,
    startedAt: session.startedAt || Date.now(),
  });
}

export async function updateGameProgress(
  context: Context,
  sessionId: string,
  currentText: string,
  wpm: number,
  accuracy: number,
  elapsedTime: number
) {
  const session = await (async () => {
    // Import here to avoid circular dependency
    const { getSession } = await import('./sessionManager');
    return getSession(context, sessionId);
  })();

  if (session) {
    await saveSession(context, {
      ...session,
      currentText,
      wpm,
      accuracy,
    });
    await publishPlayerProgress(context, sessionId, {
      currentText,
      wpm,
      accuracy,
      elapsedTime,
    });
  }
}

export async function finishGameSession(
  context: Context,
  sessionId: string,
  finalWpm: number,
  finalAccuracy: number,
  totalTime: number
) {
  const session = await (async () => {
    const { getSession } = await import('./sessionManager');
    return getSession(context, sessionId);
  })();

  if (session) {
    await saveSession(context, {
      ...session,
      wpm: finalWpm,
      accuracy: finalAccuracy,
    });
    await publishGameEnded(context, sessionId, {
      finalWpm,
      finalAccuracy,
      totalTime,
    });
  }

  // Cleanup after a short delay to allow message delivery
  setTimeout(async () => {
    await deleteSession(context, sessionId);
  }, 5000);
}

export { incrSpectatorCount, decrSpectatorCount };

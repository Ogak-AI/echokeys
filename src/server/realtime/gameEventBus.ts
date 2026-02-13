import { saveSession, getSession, Session } from './sessionManager';
import {
  publishPlayerProgress,
  publishGameStarted,
  publishGameEnded,
} from './websocketServer';

/**
 * Centralized event bus for game lifecycle events.
 * Call these from the game controller to notify spectators.
 */

export async function createGameSession(sessionId: string, session: Session) {
  await saveSession(session);
  await publishGameStarted(sessionId, {
    username: session.username,
    verseText: session.verseText,
    startedAt: session.startedAt,
  });
}

export async function updateGameProgress(
  sessionId: string,
  currentText: string,
  wpm: number,
  accuracy: number,
  elapsedTime: number
) {
  const session = await getSession(sessionId);
  if (session) {
    await saveSession({
      ...session,
      currentText,
      wpm,
      accuracy,
    });
    await publishPlayerProgress(sessionId, {
      currentText,
      wpm,
      accuracy,
      elapsedTime,
    });
  }
}

export async function finishGameSession(
  sessionId: string,
  finalWpm: number,
  finalAccuracy: number,
  totalTime: number
) {
  const session = await getSession(sessionId);
  if (session) {
    await saveSession({
      ...session,
      wpm: finalWpm,
      accuracy: finalAccuracy,
    });
    await publishGameEnded(sessionId, {
      finalWpm,
      finalAccuracy,
      totalTime,
    });
  }
}

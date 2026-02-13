import { WebSocket } from 'ws';
import { globalPubSub } from './pubsub';
import {
  getSession,
  incrSpectatorCount,
  decrSpectatorCount,
  setSessionTTL,
  deleteSession,
} from './sessionManager';

const CHANNEL_FOR = (sessionId: string) => `keyscripture:game:${sessionId}`;

export class SpectatorController {
  private sockets = new Map<string, Set<WebSocket>>();
  private redisSubs = new Map<string, boolean>();

  async join(sessionId: string, ws: WebSocket, onClose?: () => void) {
    const session = await getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (!session.isPublic) throw new Error('Session is private');

    // add ws to local set
    let set = this.sockets.get(sessionId);
    if (!set) {
      set = new Set();
      this.sockets.set(sessionId, set);
    }
    set.add(ws);

    // subscribe to redis channel once
    if (!this.redisSubs.get(sessionId)) {
      this.redisSubs.set(sessionId, true);
      await globalPubSub.subscribe(CHANNEL_FOR(sessionId), (msg) => {
        const clients = this.sockets.get(sessionId);
        if (!clients) return;
        const payload = JSON.stringify(msg);
        for (const c of clients) {
          if (c.readyState === WebSocket.OPEN) c.send(payload);
        }
      });
    }

    await incrSpectatorCount(sessionId);

    ws.on('close', async () => {
      set!.delete(ws);
      const remaining = await decrSpectatorCount(sessionId);
      if (set && set.size === 0) {
        // unsubscribe from redis
        await globalPubSub.unsubscribe(CHANNEL_FOR(sessionId));
        this.redisSubs.delete(sessionId);
        this.sockets.delete(sessionId);
      }
      if (onClose) onClose();
      // if no spectators and session ended, set short TTL
      if (remaining === 0) {
        await setSessionTTL(sessionId, 60 * 5);
      }
    });
  }

  async closeSession(sessionId: string) {
    // Close all sockets for a session and clean up
    const set = this.sockets.get(sessionId);
    if (set) {
      for (const s of set) {
        try {
          s.close(1000, 'Session closed');
        } catch {}
      }
      this.sockets.delete(sessionId);
    }
    try {
      await globalPubSub.unsubscribe(CHANNEL_FOR(sessionId));
    } catch {}
    this.redisSubs.delete(sessionId);
    await deleteSession(sessionId);
  }
}

export const spectatorController = new SpectatorController();

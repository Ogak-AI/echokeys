import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spectatorController } from './spectatorController';
import { getSession, saveSession } from './sessionManager';
import { globalPubSub } from './pubsub';
import { rateLimit } from './rateLimiter';

type Incoming = {
  type: string;
  sessionId?: string;
  token?: string;
  payload?: any;
};

export function createWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: '/spectator' });

  wss.on('connection', (ws: WebSocket, req) => {
    // simple query param parsing
    const url = req.url || '';
    const params = new URL('http://x' + url).searchParams;
    const sessionId = params.get('sessionId');

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(String(data)) as Incoming;
        if (msg.type === 'JOIN') {
          if (!msg.sessionId) {
            ws.send(JSON.stringify({ error: 'missing sessionId' }));
            return;
          }
          try {
            await spectatorController.join(msg.sessionId, ws);
            const session = await getSession(msg.sessionId);
            if (session) {
              ws.send(JSON.stringify({ type: 'JOINED', session }));
            }
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
            ws.close(4000, err.message);
          }
        } else if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
        } else {
          // spectators are not allowed to push progress
          ws.send(JSON.stringify({ type: 'ERROR', message: 'unsupported' }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'invalid message' }));
      }
    });

    ws.on('close', () => {});
  });

  return wss;
}

export async function publishPlayerProgress(sessionId: string, payload: any) {
  // throttle by sessionId to 100ms minimum using rateLimit
  const key = `progress:${sessionId}`;
  if (!rateLimit(key, 1, 0.1)) return; // 10rps ~ 100ms
  await globalPubSub.publish(`keyscripture:game:${sessionId}`, { type: 'PLAYER_PROGRESS', sessionId, ...payload });
}

export async function publishGameStarted(sessionId: string, payload: any) {
  await globalPubSub.publish(`keyscripture:game:${sessionId}`, { type: 'GAME_STARTED', sessionId, ...payload });
}

export async function publishGameEnded(sessionId: string, payload: any) {
  await globalPubSub.publish(`keyscripture:game:${sessionId}`, { type: 'GAME_ENDED', sessionId, ...payload });
}

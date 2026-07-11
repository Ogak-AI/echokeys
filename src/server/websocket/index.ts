import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { getWeeklyLeaderboard } from '../services/leaderboardService.js';
import type { WsClientEvent } from '../../shared/types/index.js';

let io: SocketIOServer | null = null;

export function setupWebSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/ws',
  });

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on('message', (data: WsClientEvent) => {
      switch (data.type) {
        case 'subscribe_leaderboard':
          socket.join('leaderboard');
          // Send current leaderboard immediately
          const entries = getWeeklyLeaderboard();
          socket.emit('message', { type: 'leaderboard_update', entries });
          break;

        case 'unsubscribe_leaderboard':
          socket.leave('leaderboard');
          break;

        case 'game_progress':
          // Broadcast to leaderboard subscribers
          io?.to('leaderboard').emit('message', {
            type: 'player_progress',
            user_id: socket.data.userId || 'anonymous',
            username: socket.data.username || 'Anonymous',
            wpm: data.wpm,
            accuracy: data.accuracy,
            progress: data.progress,
          });
          break;

        case 'game_start':
          socket.data.challengeId = data.challenge_id;
          break;

        case 'game_end':
          io?.to('leaderboard').emit('message', {
            type: 'game_complete',
            user_id: socket.data.userId || 'anonymous',
            username: socket.data.username || 'Anonymous',
            score: data.score,
            wpm: 0,
            accuracy: 0,
          });
          break;
      }
    });

    // Allow clients to set their identity
    socket.on('identify', (data: { userId: string; username: string }) => {
      socket.data.userId = data.userId;
      socket.data.username = data.username;
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[WS] WebSocket server initialized');
  return io;
}

/** Broadcast updated leaderboard to all subscribers */
export function broadcastLeaderboardUpdate(): void {
  if (!io) return;
  const entries = getWeeklyLeaderboard();
  io.to('leaderboard').emit('message', { type: 'leaderboard_update', entries });
}

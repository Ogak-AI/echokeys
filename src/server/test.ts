import { updateUserStats } from './index';
import { redis } from '@devvit/redis';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { Server } from 'socket.io';
import { createServer } from 'http';
import Client from 'socket.io-client';
import express from 'express';

// Mock the redis client
vi.mock('@devvit/redis', () => ({
  redis: {
    hGetAll: vi.fn(),
    sMembers: vi.fn(),
    zRangeWithScores: vi.fn(),
    hSet: vi.fn(),
    zAdd: vi.fn(),
    zRevRank: vi.fn(),
    del: vi.fn(),
  },
}));

// Mock the server and context
vi.mock('@devvit/web/server', async () => {
  const actual = await vi.importActual('@devvit/web/server');
  return {
    ...actual,
    createServer: (app) => createServer(app),
    context: {
      user: {
        username: 'testuser',
      },
    },
    getServerPort: () => 3000,
  };
});

describe('updateUserStats', () => {
  afterEach(async () => {
    vi.clearAllMocks();
  });

  it('should update user stats and leaderboard correctly', async () => {
    const result = {
      wpm: 100,
      accuracy: 95,
      time: 60000,
      challengeId: 'test-challenge',
    };

    (redis.hGetAll as any).mockResolvedValue({
      bestWPM: '80',
      bestAccuracy: '90',
      totalGames: '10',
      streak: '5',
    });
    (redis.zRevRank as any).mockResolvedValue(0);

    const { newHighScore, rank } = await updateUserStats('test', result);

    expect(newHighScore).toBe(true);
    expect(rank).toBe(1);

    expect(redis.hSet).toHaveBeenCalledWith('user:test:stats', {
      bestWPM: '100',
      bestAccuracy: '95',
      totalGames: '11',
      streak: '6',
    });

    expect(redis.zAdd).toHaveBeenCalled();
  });
});

describe('Spectator Mode', () => {
  let io, serverSocket, clientSocket, app, server;

  beforeAll((done) => {
    app = express();
    const httpServer = createServer(app);
    io = new Server(httpServer);
    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      serverSocket = io.on('connection', (socket) => {
        serverSocket = socket;
      });
      clientSocket = Client(`http://localhost:${port}`);
      clientSocket.on('connect', done);
    });
    server = httpServer;
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    server.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('/api/games should return a list of active games', async () => {
    (redis.sMembers as any).mockResolvedValue(['player1', 'player2']);
    (redis.hGetAll as any).mockImplementation((key) => {
      if (key === 'game:player1') {
        return {
          challenge: JSON.stringify({
            id: 'daily-1',
            text: 'test challenge 1',
            date: '2024-01-01',
            difficulty: 'easy',
          }),
          currentInput: 'test',
          startTime: '1000',
          wpm: '50',
          accuracy: '90',
          errorIndexes: '[]',
        };
      }
      if (key === 'game:player2') {
        return {
          challenge: JSON.stringify({
            id: 'daily-2',
            text: 'test challenge 2',
            date: '2024-01-01',
            difficulty: 'medium',
          }),
          currentInput: 'test challenge',
          startTime: '2000',
          wpm: '60',
          accuracy: '95',
          errorIndexes: '[]',
        };
      }
      return {};
    });

    const { router } = await import('./index');
    app.use(router);

    const res = await new Promise((resolve) => {
        const req = {
            method: 'GET',
            url: '/api/games',
        };
        const res = {
            json(data) {
                resolve({ data });
            },
            status(code) {
                return this;
            },
            send(data) {
                resolve({ data });
            }
        };
        router.handle(req, res, () => {});
    });


    expect((res as any).data.length).toBe(2);
    expect((res as any).data[0].username).toBe('player1');
    expect((res as any).data[1].username).toBe('player2');
  });

  it('watchGame socket event should send initial game state', (done) => {
    const gameUsername = 'test-user';
    const gameState = {
      challenge: JSON.stringify({
        id: 'daily-1',
        text: 'test challenge 1',
        date: '2024-01-01',
        difficulty: 'easy',
      }),
      currentInput: 'test',
      startTime: '1000',
      wpm: '50',
      accuracy: '90',
      errorIndexes: '[]',
    };
    (redis.hGetAll as any).mockResolvedValue(gameState);

    clientSocket.emit('watchGame', gameUsername);

    clientSocket.on('gameStateUpdate', (data) => {
      expect(data.username).toBe(gameUsername);
      expect(data.currentInput).toBe('test');
      done();
    });
  });
});

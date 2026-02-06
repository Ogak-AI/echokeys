import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GetLeaderboardResponse, UserStats, DailyChallenge, GameResult } from '../shared/types/api';
import { createServer, context } from '@devvit/web/server';
import { redis } from '@devvit/redis'; // Import the redis client directly
import { realtime } from '@devvit/realtime/server';
import challengesData from './challenges.json' assert { type: 'json' };
import { Server as SocketIOServer } from 'socket.io';
import { GameRoomManager } from './gameRoomManager.js';
import { ChallengeManager } from './challengeManager.js';
// The DevvitRedisClient interface and the context re-assignment are no longer needed.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

// Fallback challenges if files can't be loaded
const fallbackChallenges: Omit<DailyChallenge, 'id' | 'date'>[] = [
  {
    text: 'Welcome to KeyScripture! Type this simple sentence to get started.',
    difficulty: 'easy',
  },
  {
    text: 'Reddit is a network of communities where people can dive into their interests, hobbies and passions.',
    difficulty: 'medium',
  },
  {
    text: 'The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet.',
    difficulty: 'medium',
  },
  {
    text: 'In the world of programming, typing speed and accuracy are crucial skills for developers.',
    difficulty: 'hard',
  },
  {
    text: 'Memes are a huge part of internet culture, spreading joy and humor across social platforms.',
    difficulty: 'medium',
  },
  {
    text: 'Devvit allows developers to create interactive experiences directly within Reddit posts.',
    difficulty: 'hard',
  },
  {
    text: 'Community engagement is key to building successful online platforms and fostering meaningful connections.',
    difficulty: 'hard',
  },
];

// Load daily challenges from challenge files
let challenges: Omit<DailyChallenge, 'id' | 'date'>[] = [];
let challengesLoaded = false;

async function loadChallenges() {
  try {
    // First, try to use the embedded challenges data
    if (Array.isArray(challengesData) && challengesData.length > 0) {
      challenges = challengesData.map((p) => ({
        text: (p.text || '').trim(),
        difficulty: (p.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
      }));
      challengesLoaded = true;
      console.log(`Loaded ${challenges.length} challenges from embedded data`);
      return;
    }

    const candidates = [
      path.join(__dirname, 'challenges'),
      path.join(__dirname, '..', 'challenges'),
      path.join(process.cwd(), 'server', 'challenges'),
      path.join(process.cwd(), 'src', 'server', 'challenges'),
    ];

    let challengesDir: string | null = null;
    for (const c of candidates) {
      try {
        const s = await fs.stat(c);
        if (s.isDirectory()) {
          challengesDir = c;
          break;
        }
      } catch (_) {
        // ignore
      }
    }

    if (challengesDir) {
      try {
        const files = await fs.readdir(challengesDir);
        const challengeFiles = files
          .filter((f) => f.endsWith('.txt'))
          .sort()
          .slice(0, 365); // Limit to 365 challenges for a year

        for (const file of challengeFiles) {
          const text = await fs.readFile(path.join(challengesDir, file), 'utf-8');
          let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
          const difficultyMatch = file.match(/-(easy|medium|hard)\.txt$/i);
          if (difficultyMatch && difficultyMatch[1]) {
            difficulty = difficultyMatch[1].toLowerCase() as 'easy' | 'medium' | 'hard';
          }
          challenges.push({ text: text.trim(), difficulty });
        }

        if (challenges.length > 0) {
          challengesLoaded = true;
          console.log(`Loaded ${challenges.length} challenges from ${challengesDir}`);
          return;
        }
      } catch (fileErr) {
        console.warn(
          'Could not load challenges from files, trying JSON:',
          fileErr instanceof Error ? fileErr.message : 'Unknown error'
        );
      }
    } else {
      console.warn('No challenges directory found in any candidate paths, trying JSON');
    }
    // Also try JSON challenge files in common locations (single-file bundle)
    const jsonCandidatesBase = [
      path.join(__dirname, 'challenges.json'),
      path.join(__dirname, '..', 'challenges.json'),
      path.join(process.cwd(), 'server', 'challenges.json'),
      path.join(process.cwd(), 'src', 'server', 'challenges.json'),
    ];

    const jsonCandidates: string[] = [...jsonCandidatesBase];
    // Also try ancestors of __dirname (covers built output locations)
    for (let i = 1; i <= 5; i++) {
      const ups = Array(i).fill('..');
      jsonCandidates.push(path.join(__dirname, ...ups, 'challenges.json'));
      jsonCandidates.push(path.join(__dirname, ...ups, 'server', 'challenges.json'));
      jsonCandidates.push(path.join(__dirname, ...ups, 'src', 'server', 'challenges.json'));
    }

    for (const jc of jsonCandidates) {
      try {
        const s = await fs.stat(jc);
        if (s.isFile()) {
          try {
            const raw = await fs.readFile(jc, 'utf-8');
            const parsed = JSON.parse(raw) as Array<{ text: string; difficulty?: string }>;
            if (Array.isArray(parsed) && parsed.length > 0) {
              challenges = parsed.map((p) => ({
                text: (p.text || '').trim(),
                difficulty: (p.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
              }));
              challengesLoaded = true;
              console.log(`Loaded ${challenges.length} challenges from JSON ${jc}`);
              return;
            }
          } catch (jsonErr) {
            console.warn(
              'Failed to parse challenges JSON, trying next candidate:',
              jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
            );
          }
        }
      } catch (_) {
        // ignore missing
      }
    }

    // Use fallback challenges if files couldn't be loaded
    challenges = fallbackChallenges;
    challengesLoaded = true;
    console.log('Using fallback challenges');
  } catch (err) {
    console.error('Failed to load challenges:', err);
    challenges = fallbackChallenges;
    challengesLoaded = true;
  }
}

// Pre-load challenges (awaited to ensure they load before first request)
void (async () => {
  try {
    await loadChallenges();
  } catch (err) {
    console.error('Failed to pre-load challenges:', err);
  }
})();

function getDailyChallenge(): DailyChallenge {
  if (!challengesLoaded || challenges.length === 0) {
    return {
      text: 'Loading challenges...',
      difficulty: 'easy',
      id: 'loading',
      date: new Date().toISOString().split('T')[0] || new Date().toDateString(),
    };
  }
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  const challengeIndex = dayOfYear % challenges.length;
  const challenge = challenges[challengeIndex];
  return {
    ...challenge,
    id: `daily-${dayOfYear}`,
    date: today.toISOString().split('T')[0] || today.toDateString(),
  } as DailyChallenge;
}

async function getUserStats(username: string): Promise<UserStats> {
  try {
    const stats = await redis.hGetAll(`user:${username}:stats`);
    return {
      bestWPM: parseFloat(stats.bestWPM || '0'),
      bestAccuracy: parseFloat(stats.bestAccuracy || '0'),
      totalGames: parseInt(stats.totalGames || '0'),
      streak: parseInt(stats.streak || '0'),
    };
  } catch (error) {
    console.error('Failed to get user stats:', error);
    return {
      bestWPM: 0,
      bestAccuracy: 0,
      totalGames: 0,
      streak: 0,
    };
  }
}

async function updateUserStats(
  username: string,
  result: GameResult
): Promise<{ newHighScore: boolean; rank: number }> {
  const stats = await getUserStats(username);
  let newHighScore = false;
  if (result.wpm > stats.bestWPM) {
    stats.bestWPM = result.wpm;
    newHighScore = true;
  }
  if (result.accuracy > stats.bestAccuracy) {
    stats.bestAccuracy = result.accuracy;
  }
  stats.totalGames += 1;
  // For streak, we'd need to track last play date, but simplify for now
  stats.streak = stats.streak + 1; // Assume daily play

  await redis.hSet(`user:${username}:stats`, {
    bestWPM: stats.bestWPM.toString(),
    bestAccuracy: stats.bestAccuracy.toString(),
    totalGames: stats.totalGames.toString(),
    streak: stats.streak.toString(),
  });

  // Update leaderboard
  const member = `${username}:${Date.now()}:${result.accuracy}`;
  await redis.zAdd('leaderboard', { score: result.wpm, member });

  // Get rank (1-based) - TODO: implement proper rank calculation
  const rank = 1; // Placeholder

  return { newHighScore, rank };
}

async function addActivePlayer(username: string): Promise<void> {
  // Add player with timestamp for cleanup
  const timestamp = Date.now();
  await redis.hSet('active_players', { [username]: '1' });
  await redis.hSet('all_game_players', { [username]: '1' }); // Add to all game players set
  await redis.hSet(`player:${username}:session`, {
    isPublic: 'true',
    startTime: timestamp.toString(),
    lastActivity: timestamp.toString(),
  });
  console.log(
    `Player ${username} added to active players with startTime: ${new Date(timestamp).toISOString()}`
  );
}

// The Devvit server is the one we should listen on and attach Socket.IO to
const server = createServer(app);
// const port = getServerPort();

// Initialize Socket.IO server
// const io = new SocketIOServer(server, {
//   cors: {
//     origin: '*',
//     methods: ['GET', 'POST'],
//   },
// });

// Initialize game room manager
const challengeManager = new ChallengeManager();
const gameRoomManager = new GameRoomManager(challengeManager);

// Socket.IO event handlers
// io.on('connection', (socket) => {
  /*
  console.log(`Client connected: ${socket.id}`);

  socket.on('createGame', (data: { username: string; difficulty: 'easy' | 'medium' | 'hard' }) => {
    try {
      const { username, difficulty } = data;
      const roomId = gameRoomManager.createGame(username, difficulty);
      socket.emit('gameCreated', { roomId });
      console.log(`Game created for ${username} with room ${roomId}`);
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  socket.on('joinGame', (data: { roomId: string; username: string; asSpectator?: boolean }) => {
    try {
      const { roomId, username, asSpectator = false } = data;
      const success = gameRoomManager.joinGame(socket, roomId, username, asSpectator);
      if (success) {
        socket.emit('joinedGame', { roomId, asSpectator });
        console.log(`${username} joined room ${roomId} as ${asSpectator ? 'spectator' : 'player'}`);
      } else {
        socket.emit('error', { message: 'Failed to join game' });
      }
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on(
    'updateProgress',
    (data: {
      roomId: string;
      currentInput: string;
      wpm: number;
      accuracy: number;
      errorIndexes: number[];
    }) => {
      try {
        const { roomId, currentInput, wpm, accuracy, errorIndexes } = data;
        gameRoomManager.updatePlayerProgress(socket.id, roomId, {
          currentInput,
          wpm,
          accuracy,
          errorIndexes,
        });
        console.log(`Progress update for ${socket.id} in room ${roomId}`);
      } catch (error) {
        console.error('Error updating progress:', error);
        socket.emit('error', { message: 'Failed to update progress' });
      }
    }
  );

  socket.on('disconnect', () => {
    try {
      gameRoomManager.leaveGame(socket.id);
      console.log(`Client disconnected: ${socket.id}`);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
  */
// });

// Broadcast game states every 2 seconds
// setInterval(() => {
//   try {
//     gameRoomManager.broadcastGameStates(io);
//   } catch (error) {
//     console.error('Error broadcasting game states:', error);
//   }
// }, 2000);
// Function to get the current challenge
router.get('/api/challenge', async (_req, res) => {
  try {
    const challenge = getDailyChallenge();
    await addActivePlayer(context.username || 'anonymous');
    res.json(challenge);
  } catch (error) {
    console.error('Failed to get daily challenge:', error);
    res.status(500).send('Failed to load challenge');
  }
});

// Function to get a challenge by difficulty
router.get('/api/challenge/:difficulty', async (req, res) => {
  try {
    const { difficulty } = req.params;
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty level' });
    }

    // Ensure challenges are loaded
    if (!challengesLoaded || challenges.length === 0) {
      return res.status(503).json({ error: 'Challenges are still loading, please try again' });
    }

    // Filter challenges by difficulty
    const filteredChallenges = challenges.filter((c) => c.difficulty === difficulty);
    if (filteredChallenges.length === 0) {
      return res.status(404).json({ error: 'No challenges found for this difficulty' });
    }

    // Select a random challenge from the filtered list
    const randomIndex = Math.floor(Math.random() * filteredChallenges.length);
    const challenge = filteredChallenges[randomIndex];

    // Create a challenge object with ID and date
    const challengeWithId = {
      ...challenge,
      id: `challenge-${difficulty}-${randomIndex}`,
      date: new Date().toISOString().split('T')[0] || new Date().toDateString(),
    };

    await addActivePlayer(context.username || 'anonymous');
    res.json(challengeWithId);
  } catch (error) {
    console.error('Failed to get challenge by difficulty:', error);
    res.status(500).send('Failed to load challenge');
  }
});

// Function to get the leaderboard
router.get('/api/leaderboard', async (_req, res) => {
  try {
    const leaderboard = await redis.zRange('leaderboard', '-inf', '+inf');
    const sorted = leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);
    const response: GetLeaderboardResponse['leaderboard'] = sorted.map((item, index) => {
      const [username, timestamp, accuracy] = item.member.split(':');
      return {
        rank: index + 1,
        username: username || 'anonymous',
        wpm: item.score,
        accuracy: parseFloat(accuracy || '0'),
        date: new Date(parseInt(timestamp || '0')).toISOString().split('T')[0] || '',
      };
    });
    res.json({ type: 'leaderboard', leaderboard: response });
  } catch (error) {
    console.error('Failed to get leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Function to get user stats
router.get('/api/stats/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const stats = await getUserStats(username);
    res.json(stats);
  } catch (error) {
    console.error('Failed to get user stats:', error);
    res.status(500).send('Failed to get user stats');
  }
});

// Function to initialize the game
router.get('/api/init', async (_req, res) => {
  try {
    const challenge = getDailyChallenge();
    const username = context.username || 'anonymous';
    // const userStats = await getUserStats(username);
    const userStats = {
      bestWPM: 0,
      bestAccuracy: 0,
      totalGames: 0,
      streak: 0,
    };
    const postId = 'keyscripture_post'; // Placeholder, can be from context or params
    res.json({ type: 'init', postId, username, userStats, dailyChallenge: challenge });
  } catch (error) {
    console.error('Failed to init game:', error);
    res.status(500).json({ error: 'Failed to initialize game' });
  }
});

// Function to submit score
router.post('/api/submit', async (req, res) => {
  try {
    const result: GameResult = req.body;
    const username = context.username || 'anonymous';
    const { newHighScore, rank } = await updateUserStats(username, result);
    const postId = 'keyscripture_post';
    res.json({ type: 'submitScore', postId, newHighScore, rank });
  } catch (error) {
    console.error('Failed to submit score:', error);
    res.status(500).json({ error: 'Failed to submit score' });
  }
});

// Function to update game state for spectators
router.post('/api/update-game-state', async (req, res) => {
  try {
    const { username, challenge, currentInput, startTime, wpm, accuracy, errorIndexes } = req.body;

    // Validate required fields
    if (
      !username ||
      !challenge ||
      currentInput === undefined ||
      startTime === undefined ||
      wpm === undefined ||
      accuracy === undefined ||
      errorIndexes === undefined
    ) {
      console.error('Missing game state parameters');
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const now = Date.now();
    await redis.hSet(`player:${username}:session`, { lastActivity: now.toString() });
    console.log(`Player ${username} activity updated at: ${new Date(now).toISOString()}`);

    const gameData = {
      challenge: JSON.stringify(challenge),
      currentInput,
      startTime: startTime.toString(),
      wpm: wpm.toString(),
      accuracy: accuracy.toString(),
      lastUpdate: now.toString(),
      errorIndexes: JSON.stringify(errorIndexes),
    };

    // Store game state in Redis
    await redis.hSet(`game:${username}`, gameData);

    // Broadcast update to spectators via Devvit realtime
    const updatedData = {
      username,
      challenge,
      currentInput,
      startTime,
      wpm,
      accuracy,
      errorIndexes,
      gameCompleted: currentInput.length >= challenge.text.length,
    };

    await realtime.send('keyscripture_dev', {
      type: 'gameUpdate',
      gameUsername: username,
      data: updatedData,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update game state:', error);
    res.status(500).json({ error: 'Failed to update game state' });
  }
});

// Endpoint to get all active rooms
router.get('/api/active-rooms', async (_req, res) => {
  try {
    const activeGames = gameRoomManager.getActiveGames();
    res.json(activeGames);
  } catch (error) {
    console.error('Failed to get active rooms:', error);
    res.status(500).send('Failed to get active rooms');
  }
});

// Mount the router to the app
app.use(router);

// Initialize Devvit realtime for broadcasting
// Note: Broadcasting to subreddit for spectator updates

export default app;

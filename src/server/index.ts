import express from 'express';
import { createServer, context } from '@devvit/web/server';
import { redis } from '@devvit/redis'; // Import the redis client directly
import challengesData from './challenges.json' assert { type: 'json' };
import { ChallengeManager } from './challengeManager.js';
import type { GetLeaderboardResponse, UserStats, DailyChallenge, GameResult } from '../shared/types/api';

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
    // In Devvit serverless environment, only use embedded challenges data
    // Filesystem access (fs.readdir, fs.readFile) is NOT available in Devvit
    if (Array.isArray(challengesData) && challengesData.length > 0) {
      challenges = challengesData.map((p) => ({
        text: (p.text || '').trim(),
        difficulty: (p.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
      }));
      challengesLoaded = true;
      console.log(`Loaded ${challenges.length} challenges from embedded data`);
      return;
    }

    // Fallback if embedded data is empty
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
  try {
    if (!redis || typeof redis.hSet !== 'function') {
      console.warn('Redis client not available; skipping addActivePlayer');
      return;
    }
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
  } catch (err) {
    console.warn('addActivePlayer failed, continuing without active tracking:', err instanceof Error ? err.message : err);
  }
}

// The Devvit server is the one we should listen on
const server = createServer(app);

// Initialize challenge manager
const challengeManager = new ChallengeManager();

// No realtime broadcasting — simplified server (no Socket.IO)
// Function to get the current challenge
router.get('/api/challenge', async (_req, res) => {
  try {
    const challenge = getDailyChallenge();
    try {
      await addActivePlayer((context && (context as any).username) || 'anonymous');
    } catch (ignore) {
      // ignore
    }
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

    try {
      await addActivePlayer((context && (context as any).username) || 'anonymous');
    } catch (ignore) {
      // ignore
    }
    res.json(challengeWithId);
  } catch (error) {
    console.error('Failed to get challenge by difficulty:', error);
    res.status(500).send('Failed to load challenge');
  }
});

// Function to get the leaderboard
router.get('/api/leaderboard', async (_req, res) => {
  try {
    let entries: Array<{ member: string; score: number }> = [];
    try {
      // Try zRange with scores if available
      if (redis && typeof (redis as any).zRangeWithScores === 'function') {
        const withScores = await (redis as any).zRangeWithScores('leaderboard', 0, -1, { REV: true });
        entries = Array.isArray(withScores) ? withScores.map((e: any) => ({ member: e.value || e.member || e.member, score: e.score || e.score })) : [];
      } else {
        // Fallback: try zRange and parse members as plain strings
        const members = (await redis.zRange('leaderboard', 0, -1)) || [];
        // members may be strings like 'username:timestamp:accuracy' without scores; we can't determine score reliably
        entries = members.map((m: string) => ({ member: m, score: 0 }));
      }
    } catch (redisErr) {
      console.warn('Leaderboard read failed, returning empty list:', redisErr instanceof Error ? redisErr.message : redisErr);
      entries = [];
    }

    const sorted = entries.slice(0, 10);
    const response: GetLeaderboardResponse['leaderboard'] = sorted.map((item, index) => {
      const parts = (item.member || '').split(':');
      const username = parts[0] || 'anonymous';
      const timestamp = parts[1] || '';
      const accuracy = parts[2] || '0';
      return {
        rank: index + 1,
        username,
        wpm: item.score || 0,
        accuracy: parseFloat(accuracy),
        date: timestamp ? new Date(parseInt(timestamp)).toISOString().split('T')[0] : '',
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
    const username = (context && (context as any).username) || 'anonymous';
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

    // Note: Realtime spectator feature has been removed
    // Previously: await realtime.send('keyscripture_dev', { ... });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update game state:', error);
    res.status(500).json({ error: 'Failed to update game state' });
  }
});

// Mount the router to the app
app.use(router);

// Initialize Devvit realtime for broadcasting
// Note: Broadcasting to subreddit for spectator updates

export default server;

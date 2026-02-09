import express from 'express';
import { createServer, context } from '@devvit/web/server';
import { redis } from '@devvit/redis'; // Import the redis client directly
import type { GetLeaderboardResponse, UserStats, DailyChallenge, GameResult } from '../shared/types/api';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

// Embedded challenges data (hardcoded to ensure it works in serverless environment)
const embeddedChallenges: Omit<DailyChallenge, 'id' | 'date'>[] = [
  {
    text: 'Welcome to KeyScripture! Type this simple sentence to get started.',
    difficulty: 'easy',
  },
  {
    text: 'Reddit is a network of communities where people can dive into their interests, hobbies and passions.',
    difficulty: 'easy',
  },
  {
    text: 'The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet.',
    difficulty: 'medium',
  },
  {
    text: 'In the world of programming, typing speed and accuracy are crucial skills for developers.',
    difficulty: 'medium',
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
  {
    text: 'Esther\nChapter 1\n1 Now in the days of Ahasuerus, that is, the Ahasuerus who ruled over 127 provinces from India to Ethiopia, 2 in those days when King Ahasuerus was sitting on his royal throne in Shushan the citadel, 3 in the third year of his reign, he held a banquet for all his princes and his servants.',
    difficulty: 'hard',
  },
];

// Load daily challenges
let challenges: Omit<DailyChallenge, 'id' | 'date'>[] = [];
let challengesLoaded = false;

// Initialize challenges synchronously
function initChallengesSync() {
  try {
    console.log('[Server Init] Initializing challenges');
    
    // Use embedded challenges directly
    if (Array.isArray(embeddedChallenges) && embeddedChallenges.length > 0) {
      console.log('[Server Init] Processing', embeddedChallenges.length, 'embedded challenges');
      challenges = embeddedChallenges.map((p, idx) => {
        const processed = {
          text: (p.text || '').trim(),
          difficulty: (p.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
        };
        if (idx === 0) {
          console.log('[Server Init] Sample challenge[0]:', {
            textLength: processed.text.length,
            difficulty: processed.difficulty,
            textPreview: processed.text.substring(0, 50) + '...',
          });
        }
        return processed;
      });
      challengesLoaded = true;
      console.log(`[Server Init] Successfully loaded ${challenges.length} challenges`);
      
      // Log distribution
      const dist = { easy: 0, medium: 0, hard: 0 };
      challenges.forEach(c => {
        if (c.difficulty in dist) dist[c.difficulty as keyof typeof dist]++;
      });
      console.log('[Server Init] Difficulty distribution:', dist);
      return;
    }
    
    // Fallback if data is empty (shouldn't happen)
    console.log('[Server Init] No challenges available, this should not happen');
    challenges = embeddedChallenges;
    challengesLoaded = true;
  } catch (err) {
    console.error('[Server Init] ERROR initializing challenges:', err instanceof Error ? err.stack : err);
    challenges = embeddedChallenges;
    challengesLoaded = true;
  }
}

// Call synchronous initialization immediately
initChallengesSync();



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
// const challengeManager = new ChallengeManager();

// No realtime broadcasting — simplified server (no Socket.IO)
// Function to get the current challenge
router.get('/api/challenge', async (_req, res) => {
  try {
    console.log('[/api/challenge] Getting daily challenge');
    console.log('[/api/challenge] challengesLoaded:', challengesLoaded, 'challenges.length:', challenges.length);
    const challenge = getDailyChallenge();
    console.log('[/api/challenge] Daily challenge:', challenge.id);
    try {
      await addActivePlayer((context && (context as any).username) || 'anonymous');
    } catch (ignore) {
      // ignore
    }
    res.json(challenge);
  } catch (error) {
    console.error('[/api/challenge] ERROR:', error instanceof Error ? error.stack : error);
    res.status(500).json({ 
      error: 'Failed to load challenge',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Function to get a challenge by difficulty
router.get('/api/challenge/:difficulty', async (req, res) => {
  try {
    const { difficulty } = req.params;
    console.log(`[/api/challenge/${difficulty}] Request received`);
    console.log('[/api/challenge] challengesLoaded:', challengesLoaded, 'total challenges:', challenges.length);
    
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      console.warn(`[/api/challenge] Invalid difficulty: ${difficulty}`);
      return res.status(400).json({ error: 'Invalid difficulty level' });
    }

    // Ensure challenges are loaded
    if (!challengesLoaded || challenges.length === 0) {
      console.warn(`[/api/challenge] Challenges not loaded yet. challengesLoaded=${challengesLoaded}, length=${challenges.length}`);
      return res.status(503).json({ error: 'Challenges are still loading, please try again' });
    }

    // Filter challenges by difficulty
    const filteredChallenges = challenges.filter((c) => c.difficulty === difficulty);
    console.log(`[/api/challenge] Found ${filteredChallenges.length} challenges for difficulty: ${difficulty}`);
    
    if (filteredChallenges.length === 0) {
      console.warn(`[/api/challenge] No challenges found for difficulty: ${difficulty}`);
      console.log(`[/api/challenge] Available difficulties: ${challenges.map(c => c.difficulty).filter((d, i, a) => a.indexOf(d) === i).join(', ')}`);
      return res.status(404).json({ error: 'No challenges found for this difficulty' });
    }

    // Select a random challenge from the filtered list
    const randomIndex = Math.floor(Math.random() * filteredChallenges.length);
    const selectedChallenge = filteredChallenges[randomIndex];
    console.log(`[/api/challenge] Selected challenge index: ${randomIndex}, text length: ${selectedChallenge?.text?.length || 0}`);

    // Create a challenge object with ID and date
    const challengeWithId = {
      ...selectedChallenge,
      id: `challenge-${difficulty}-${randomIndex}`,
      date: new Date().toISOString().split('T')[0] || new Date().toDateString(),
    };

    try {
      await addActivePlayer((context && (context as any).username) || 'anonymous');
    } catch (ignore) {
      // ignore
    }
    console.log(`[/api/challenge] Returning challenge with ID: ${challengeWithId.id}`);
    res.json(challengeWithId);
  } catch (error) {
    console.error(`[/api/challenge] ERROR:`, error instanceof Error ? error.stack : error);
    res.status(500).json({ 
      error: 'Failed to load challenge',
      details: error instanceof Error ? error.message : String(error)
    });
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
        entries = (members as unknown as Array<any>).map((m: any) => ({ 
          member: typeof m === 'string' ? m : m.member || '', 
          score: 0 
        }));
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
        date: timestamp ? new Date(parseInt(timestamp)).toISOString().split('T')[0] || '' : '',
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
    console.log('[/api/init] ===== REQUEST RECEIVED =====');
    console.log('[/api/init] challengesLoaded:', challengesLoaded);
    console.log('[/api/init] challenges.length:', challenges.length);
    console.log('[/api/init] challenges sample:', challenges.length > 0 ? { text: challenges[0].text?.substring(0, 50), difficulty: challenges[0].difficulty } : 'NO_CHALLENGES');
    
    if (!challengesLoaded || challenges.length === 0) {
      console.warn('[/api/init] WARNING: Challenges not ready yet');
      return res.status(503).json({ 
        error: 'Challenges still loading',
        details: `challengesLoaded=${challengesLoaded}, length=${challenges.length}`
      });
    }

    let challenge;
    try {
      challenge = getDailyChallenge();
      console.log('[/api/init] Got daily challenge:', challenge.id);
    } catch (err) {
      console.error('[/api/init] Error in getDailyChallenge:', err instanceof Error ? err.message : String(err));
      throw err;
    }
    
    let username;
    try {
      // In Devvit server context, context might not be available in route handlers
      // Safely try to access it, but default to 'anonymous'
      username = 'anonymous';
      if (context && typeof context === 'object') {
        const contextUsername = (context as any).username;
        if (typeof contextUsername === 'string') {
          username = contextUsername;
        }
      }
      console.log('[/api/init] Username:', username);
    } catch (err) {
      console.error('[/api/init] Error accessing context:', err instanceof Error ? err.message : String(err));
      username = 'anonymous';
    }
    
    const userStats = {
      bestWPM: 0,
      bestAccuracy: 0,
      totalGames: 0,
      streak: 0,
    };
    const postId = 'keyscripture_post';
    
    let response;
    try {
      response = { type: 'init', postId, username, userStats, dailyChallenge: challenge };
      console.log('[/api/init] Response object created');
    } catch (err) {
      console.error('[/api/init] Error creating response:', err instanceof Error ? err.message : String(err));
      throw err;
    }
    
    console.log('[/api/init] ===== RESPONSE OK =====');
    res.json(response);
  } catch (error) {
    console.error('[/api/init] ===== ERROR =====');
    console.error('[/api/init] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[/api/init] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[/api/init] Stack:', error instanceof Error ? error.stack : 'N/A');
    
    res.status(500).json({ 
      error: 'Failed to initialize game',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
});

// Function to submit score
router.post('/api/submit', async (req, res) => {
  try {
    const result: GameResult = req.body;
    let username = 'anonymous';
    try {
      if (context && typeof context === 'object') {
        const contextUsername = (context as any).username;
        if (typeof contextUsername === 'string') {
          username = contextUsername;
        }
      }
    } catch (err) {
      console.warn('Could not access context.username:', err instanceof Error ? err.message : String(err));
    }
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
    // Note: Realtime spectator feature has been removed
    // Previously: const updatedData = {...};
    // Previously: await realtime.send(...);

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

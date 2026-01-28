import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GetLeaderboardResponse, UserStats, DailyChallenge, GameResult } from '../shared/types/api';
import { redis, reddit, createServer, context, getServerPort } from '@devvit/web/server';
import { createPost } from './core/post';

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
  { text: "Welcome to EchoKeys! Type this simple sentence to get started.", difficulty: 'easy' },
  { text: "Reddit is a network of communities where people can dive into their interests, hobbies and passions.", difficulty: 'medium' },
  { text: "The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet.", difficulty: 'medium' },
  { text: "In the world of programming, typing speed and accuracy are crucial skills for developers.", difficulty: 'hard' },
  { text: "Memes are a huge part of internet culture, spreading joy and humor across social platforms.", difficulty: 'medium' },
  { text: "Devvit allows developers to create interactive experiences directly within Reddit posts.", difficulty: 'hard' },
  { text: "Community engagement is key to building successful online platforms and fostering meaningful connections.", difficulty: 'hard' },
];

// Load daily challenges from challenge files
let challenges: Omit<DailyChallenge, 'id' | 'date'>[] = [];
let challengesLoaded = false;

async function loadChallenges() {
  try {
    const challengesDir = path.join(__dirname, 'challenges');
    try {
      const files = await fs.readdir(challengesDir);
      const challengeFiles = files
        .filter(f => f.endsWith('.txt'))
        .sort()
        .slice(0, 365); // Limit to 365 challenges for a year

      for (const file of challengeFiles) {
        const text = await fs.readFile(path.join(challengesDir, file), 'utf-8');
        // Extract difficulty from filename (e.g., "001-easy.txt" or "Genesis.txt")
        // If no difficulty is found, default to 'medium'
        let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
        const difficultyMatch = file.match(/-(easy|medium|hard)\.txt$/i);
        if (difficultyMatch && difficultyMatch[1]) {
          difficulty = difficultyMatch[1].toLowerCase() as 'easy' | 'medium' | 'hard';
        }
        challenges.push({ text: text.trim(), difficulty });
      }
      
      if (challenges.length > 0) {
        challengesLoaded = true;
        console.log(`Loaded ${challenges.length} challenges from files`);
        return;
      }
    } catch (fileErr) {
      console.warn('Could not load challenges from files, using fallback:', fileErr instanceof Error ? fileErr.message : 'Unknown error');
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

// Pre-load challenges in the background (non-blocking)
setImmediate(() => {
  loadChallenges().catch(err => console.error('Failed to pre-load challenges:', err));
});

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
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const challengeIndex = dayOfYear % challenges.length;
  const challenge = challenges[challengeIndex];
  return {
    ...challenge,
    id: `daily-${dayOfYear}`,
    date: today.toISOString().split('T')[0] || today.toDateString(),
  } as DailyChallenge;
}

async function getUserStats(username: string): Promise<UserStats> {
  const stats = await redis.hGetAll(`user:${username}:stats`);
  return {
    bestWPM: parseFloat(stats.bestWPM || '0'),
    bestAccuracy: parseFloat(stats.bestAccuracy || '0'),
    totalGames: parseInt(stats.totalGames || '0'),
    streak: parseInt(stats.streak || '0'),
  };
}

async function updateUserStats(username: string, result: GameResult): Promise<{ newHighScore: boolean; rank: number }> {
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

  // Get rank (1-based) - simplified
  const rank = 0; // TODO: implement proper ranking

  return { newHighScore, rank };
}

router.get('/api/init', async (_req, res): Promise<void> => {
  const { postId } = context;

  if (!postId) {
    res.status(400).json({
      status: 'error',
      message: 'postId is required but missing from context',
    });
    return;
  }

  try {
    const username = await reddit.getCurrentUsername() ?? 'anonymous';
    const userStats = await getUserStats(username);
    const dailyChallenge = getDailyChallenge();

    res.json({
      type: 'init',
      postId,
      username,
      userStats,
      dailyChallenge,
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to initialize' });
  }
});

router.post('/api/submit-score', async (req, res): Promise<void> => {
  const { postId } = context;
  if (!postId) {
    res.status(400).json({
      status: 'error',
      message: 'postId is required',
    });
    return;
  }

  try {
    const result: GameResult = req.body;
    const username = await reddit.getCurrentUsername() ?? 'anonymous';
    const { newHighScore, rank } = await updateUserStats(username, result);

    res.json({
      type: 'submitScore',
      postId,
      newHighScore,
      rank,
    });
  } catch (error) {
    console.error(`Submit score error:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to submit score' });
  }
});

router.get('/api/leaderboard', async (_req, res): Promise<void> => {
  try {
    const leaderboardData = await redis.zRange('leaderboard', -10, -1);
    const leaderboard: GetLeaderboardResponse['leaderboard'] = [];
    for (const entry of leaderboardData) {
      const parts = entry.member.split(':');
      if (parts.length < 3) continue;
      const [username, timestamp, accuracyStr] = parts;
      leaderboard.push({
        username: username || 'unknown',
        wpm: entry.score,
        accuracy: parseFloat(accuracyStr || '0'),
        date: new Date(parseInt(timestamp || '0')).toISOString().split('T')[0] || 'unknown',
      });
    }

    res.json({
      type: 'leaderboard',
      leaderboard,
    });
  } catch (error) {
    console.error(`Leaderboard error:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to get leaderboard' });
  }
});

router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);

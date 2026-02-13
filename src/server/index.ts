import { createServer } from '@devvit/web/server';
import express from 'express'; // Import express
import challengesData from './challenges.json' assert { type: 'json' }; // New static import
import { ChallengeManager } from './challengeManager.js'; // Import ChallengeManager

interface Challenge {
  id: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

let challenges: Challenge[] = [];
let challengeManager: ChallengeManager; // Declare challengeManager here

function initChallengesSync() {
  try {
    console.log('[Server Init] Loading challenges...');

    if (Array.isArray(challengesData) && challengesData.length > 0) {
      console.log(`[Server Init] Found ${challengesData.length} challenges in challenges.json`);
      challenges = (challengesData as any[])
        .map((p: any, index: number) => {
          if (typeof p !== 'object' || p === null) {
            console.error(`[Server Init] Invalid element at index ${index}:`, p);
            return null;
          }
          return {
            id: `challenge-${index}`,
            text: (p.text || '').trim(),
            difficulty: (p.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
          };
        })
        .filter(Boolean) as Challenge[];

      console.log(`[Server Init] Successfully loaded ${challenges.length} challenges`);

      const difficultyCounts: Record<string, number> = {};
      challenges.forEach(c => {
        difficultyCounts[c.difficulty] = (difficultyCounts[c.difficulty] || 0) + 1;
      });
      console.log('[Server Init] Challenge difficulty counts:', difficultyCounts);

      // Instantiate ChallengeManager after challenges are loaded
      challengeManager = new ChallengeManager(challenges);

    } else {
      throw new Error('No challenges found or challenges.json is not an array');
    }
  } catch (err) {
    console.error('[Server Init] ERROR initializing challenges:', err);
    challenges = [
      {
        id: 'fallback-easy-1',
        text: 'The quick brown fox jumps over the lazy dog.',
        difficulty: 'easy',
      },
    ];
    // Instantiate ChallengeManager even with fallback
    challengeManager = new ChallengeManager(challenges);
  }
}

initChallengesSync();

// Create an Express app
const app = express();

// New endpoint to serve all challenges
app.get('/api/challenges/all', (req, res) => {
  try {
    return res.status(200).json(challengeManager.getAllChallenges()); // Use the ChallengeManager to get all challenges
  } catch (error) {
    console.error('Error serving all challenges:', error);
    return res.status(500).json({ error: 'Failed to load all challenges.' });
  }
});

// Endpoint to get a random challenge by difficulty
app.get('/api/challenge', async (req, res) => {
  try {
    const difficulty = req.query.difficulty as 'easy' | 'medium' | 'hard';

    if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty provided. Must be one of: easy, medium, hard.' });
    }

    const selectedChallenge = challengeManager.getRandomChallenge(difficulty); // Use the ChallengeManager

    if (!selectedChallenge) {
      return res.status(404).json({ error: `No challenges found for difficulty: ${difficulty}` });
    }

    return res.status(200).json(selectedChallenge);
  } catch (error) {
    console.error('Challenge API error:', error);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

// Endpoint to fetch active sessions
app.get('/api/sessions/active', async (req, res) => {
  try {
    // For now, return empty array. In production, fetch from Redis keys pattern
    // keyscripture:session:* and filter for isPublic=true and spectatorCount > 0
    // This is a stub; implement Redis key scanning if needed
    return res.status(200).json([]);
  } catch (error) {
    console.error('Active sessions API error:', error);
    return res.status(500).json({ error: 'Failed to fetch active sessions.' });
  }
});

// The Devvit server. Pass the Express app to createServer
const server = createServer(app);

export default server;

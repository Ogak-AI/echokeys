import { createServer } from '@devvit/web/server';
import challengesData from './challenges.json' assert { type: 'json' };

interface Challenge {
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// Load challenges synchronously from imported data
let challenges: Challenge[] = [];
function initChallengesSync() {
  try {
    if (Array.isArray(challengesData) && challengesData.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      challenges = (challengesData as any[]).map((p: any) => ({
        text: (p.text || '').trim(),
        difficulty: (p.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
      }));
      console.log(`[Server Init] Successfully loaded ${challenges.length} challenges`);
    } else {
      throw new Error('No challenges found in challenges.json');
    }
  } catch (err) {
    console.error('[Server Init] ERROR initializing challenges:', err);
    // Use fallback challenges
    challenges = [
      {
        text: 'The quick brown fox jumps over the lazy dog.',
        difficulty: 'easy',
      },
    ];
  }
}

initChallengesSync();

// The Devvit server.
const server = createServer();

// Endpoint to get a random challenge by difficulty
server.get('/api/challenge', async (req, res) => {
  const difficulty = req.query.difficulty as 'easy' | 'medium' | 'hard';
  if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
    return res.status(400).send('Invalid difficulty provided. Must be easy, medium, or hard.');
  }

  const filteredChallenges = challenges.filter(c => c.difficulty === difficulty);
  if (filteredChallenges.length === 0) {
    return res.status(404).send(`No challenges found for difficulty: ${difficulty}`);
  }

  const randomIndex = Math.floor(Math.random() * filteredChallenges.length);
  const selectedChallenge = filteredChallenges[randomIndex];

  res.json(selectedChallenge);
});

// TODO: Add Devvit-native state management here.

export default server;

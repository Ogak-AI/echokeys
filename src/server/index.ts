import { createServer } from '@devvit/web/server';
import express from 'express'; // Import express
import challengesData from './challenges.json' assert { type: 'json' }; // New static import
import { ChallengeManager } from './challengeManager.js'; // Import ChallengeManager
import { Context } from '@devvit/public-api';

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

// Middleware to capture context (must be before routes)
app.use((req: any, res: any, next: any) => {
  globalContext = req.context;
  next();
});

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

// Store context globally for request handlers
let globalContext: Context | null = null;

// Endpoint to fetch active sessions
app.get('/api/sessions/active', async (req, res) => {
  try {
    if (!globalContext?.kv) {
      console.warn('[API] KV not available, returning empty array');
      return res.status(200).json([]);
    }

    // Fetch all sessions from KV with prefix 'session:'
    const keys = await globalContext.kv.list({ prefix: 'session:' });
    const activeSessions = [];

    for (const keyInfo of keys) {
      try {
        const data = await globalContext.kv.get(keyInfo.key);
        if (data) {
          const session = JSON.parse(data);
          // Only include public sessions
          if (session.isPublic) {
            activeSessions.push({
              sessionId: session.sessionId,
              username: session.username,
              wpm: session.wpm || 0,
              accuracy: session.accuracy || 0,
              spectatorCount: session.spectatorCount || 0,
              verseId: session.verseId,
            });
          }
        }
      } catch (itemErr) {
        console.error('[API] Error processing session:', itemErr);
      }
    }

    console.log(`[API] Returning ${activeSessions.length} active sessions`);
    return res.status(200).json(activeSessions);
  } catch (error) {
    console.error('[API] Active sessions error:', error);
    return res.status(200).json([]); // Return empty array as fallback
  }
});

// Endpoint to get a specific session
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    if (!globalContext?.kv) {
      console.warn('[API] KV not available for session fetch');
      return res.status(404).json({ error: 'Session not found' });
    }

    const data = await globalContext.kv.get(`session:${sessionId}`);
    if (!data) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = JSON.parse(data);
    // Check if public before returning
    if (!session.isPublic) {
      return res.status(403).json({ error: 'Session is private' });
    }

    return res.status(200).json(session);
  } catch (error) {
    console.error('[API] Session fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Endpoint for spectator to join
app.post('/api/spectator/join', async (req, res) => {
  try {
    const sessionId = req.body.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    if (!globalContext?.kv) {
      console.warn('[API] KV not available for spectator join');
      return res.status(200).json({ success: true }); // Graceful fallback
    }

    const data = await globalContext.kv.get(`session:${sessionId}`);
    if (!data) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = JSON.parse(data);
    session.spectatorCount = (session.spectatorCount || 0) + 1;
    await globalContext.kv.put(`session:${sessionId}`, JSON.stringify(session));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[API] Spectator join error:', error);
    return res.status(200).json({ success: true }); // Graceful fallback
  }
});

// Endpoint for spectator to leave
app.post('/api/spectator/leave', async (req, res) => {
  try {
    const sessionId = req.body.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    if (!globalContext?.kv) {
      console.warn('[API] KV not available for spectator leave');
      return res.status(200).json({ success: true }); // Graceful fallback
    }

    const data = await globalContext.kv.get(`session:${sessionId}`);
    if (!data) {
      return res.status(200).json({ success: true }); // Session already gone
    }

    const session = JSON.parse(data);
    session.spectatorCount = Math.max(0, (session.spectatorCount || 1) - 1);
    await globalContext.kv.put(`session:${sessionId}`, JSON.stringify(session));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[API] Spectator leave error:', error);
    return res.status(200).json({ success: true }); // Graceful fallback
  }
});

// The Devvit server. Pass the Express app to createServer
const server = createServer(app);

export default server;

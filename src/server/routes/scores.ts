import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { calculateScore } from '../../shared/types/index.js';
import { getUserWeeklyRank, getUserAllTimeRank } from '../services/leaderboardService.js';
import { broadcastLeaderboardUpdate } from '../websocket/index.js';

const router = Router();

// POST /api/scores — submit a score
router.post('/', (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(token) as any;
    if (!user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const { challenge_id, wpm, accuracy, time_seconds, completed } = req.body as {
      challenge_id?: string;
      wpm?: number;
      accuracy?: number;
      time_seconds?: number;
      completed?: boolean;
    };

    if (!challenge_id || wpm == null || accuracy == null || time_seconds == null) {
      res.status(400).json({ error: 'Missing required fields: challenge_id, wpm, accuracy, time_seconds' });
      return;
    }

    // Verify challenge exists
    const challenge = db.prepare('SELECT id FROM challenges WHERE id = ?').get(challenge_id);
    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    const score = calculateScore(accuracy / 100, wpm, time_seconds);
    const id = uuid();

    db.prepare(`
      INSERT INTO scores (id, user_id, challenge_id, wpm, accuracy, time_seconds, score, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, challenge_id, wpm, accuracy, time_seconds, score, completed ? 1 : 0);

    // Update user's last_played
    db.prepare('UPDATE users SET last_played = datetime(\'now\') WHERE id = ?').run(user.id);

    const weeklyRank = getUserWeeklyRank(user.id);
    const allTimeRank = getUserAllTimeRank(user.id);

    broadcastLeaderboardUpdate();

    console.log(`[Score] Submitted: user=${user.id}, wpm=${wpm}, acc=${accuracy}%, score=${score}`);

    res.json({
      score: { id, user_id: user.id, challenge_id, wpm, accuracy, time_seconds, score, completed: !!completed, played_at: new Date().toISOString() },
      weekly_rank: weeklyRank,
      all_time_rank: allTimeRank,
    });
  } catch (err) {
    console.error('[Score] Submit error:', err);
    res.status(500).json({ error: 'Failed to submit score' });
  }
});

// GET /api/scores/user/:userId — user's score history
router.get('/user/:userId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const scores = db.prepare(`
      SELECT s.*, c.concept, c.language, c.difficulty
      FROM scores s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.user_id = ?
      ORDER BY s.played_at DESC
      LIMIT 50
    `).all(req.params.userId);

    res.json({ scores });
  } catch (err) {
    console.error('[Score] History error:', err);
    res.status(500).json({ error: 'Failed to get scores' });
  }
});

export default router;

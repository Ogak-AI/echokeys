import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import {
  getWeeklyLeaderboard,
  getAllTimeLeaderboard,
  getMonthlyLeaderboard,
  getYearlyLeaderboard,
  getCurrentWeekStart,
  getCurrentWeekEnd,
} from '../services/leaderboardService.js';

const router = Router();

// GET /api/leaderboard/weekly — current week
router.get('/weekly', (_req: Request, res: Response) => {
  try {
    const entries = getWeeklyLeaderboard();
    res.json({
      entries,
      period: `${getCurrentWeekStart()} to ${getCurrentWeekEnd()}`,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Leaderboard] Weekly error:', err);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/leaderboard/weekly/:weekStart — historical week
router.get('/weekly/:weekStart', (req: Request, res: Response) => {
  try {
    const db = getDb();
    // Try archived snapshot first
    const snapshot = db.prepare(
      'SELECT snapshot_data FROM weekly_snapshots WHERE week_start = ?'
    ).get(req.params.weekStart) as { snapshot_data: string } | undefined;

    if (snapshot) {
      res.json({
        entries: JSON.parse(snapshot.snapshot_data),
        period: req.params.weekStart,
        updated_at: new Date().toISOString(),
        archived: true,
      });
      return;
    }

    // Fallback to live query
    const weekStart = Array.isArray(req.params.weekStart) ? req.params.weekStart[0] : req.params.weekStart;
    const entries = getWeeklyLeaderboard(weekStart);
    res.json({
      entries,
      period: req.params.weekStart,
      updated_at: new Date().toISOString(),
      archived: false,
    });
  } catch (err) {
    console.error('[Leaderboard] Historical weekly error:', err);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/leaderboard/monthly/:year/:month
router.get('/monthly/:year/:month', (req: Request, res: Response) => {
  try {
    const year = parseInt(Array.isArray(req.params.year) ? req.params.year[0] : req.params.year);
    const month = parseInt(Array.isArray(req.params.month) ? req.params.month[0] : req.params.month);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid year or month' });
      return;
    }

    const db = getDb();
    const snapshot = db.prepare(
      'SELECT snapshot_data FROM monthly_snapshots WHERE year = ? AND month = ?'
    ).get(year, month) as { snapshot_data: string } | undefined;

    if (snapshot) {
      res.json({
        entries: JSON.parse(snapshot.snapshot_data),
        period: `${year}-${String(month).padStart(2, '0')}`,
        updated_at: new Date().toISOString(),
        archived: true,
      });
      return;
    }

    const entries = getMonthlyLeaderboard(year, month);
    res.json({
      entries,
      period: `${year}-${String(month).padStart(2, '0')}`,
      updated_at: new Date().toISOString(),
      archived: false,
    });
  } catch (err) {
    console.error('[Leaderboard] Monthly error:', err);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/leaderboard/yearly/:year
router.get('/yearly/:year', (req: Request, res: Response) => {
  try {
    const year = parseInt(Array.isArray(req.params.year) ? req.params.year[0] : req.params.year);
    if (isNaN(year)) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }

    const db = getDb();
    const snapshot = db.prepare(
      'SELECT snapshot_data FROM yearly_snapshots WHERE year = ?'
    ).get(year) as { snapshot_data: string } | undefined;

    if (snapshot) {
      res.json({
        entries: JSON.parse(snapshot.snapshot_data),
        period: String(year),
        updated_at: new Date().toISOString(),
        archived: true,
      });
      return;
    }

    const entries = getYearlyLeaderboard(year);
    res.json({
      entries,
      period: String(year),
      updated_at: new Date().toISOString(),
      archived: false,
    });
  } catch (err) {
    console.error('[Leaderboard] Yearly error:', err);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/leaderboard/all-time
router.get('/all-time', (_req: Request, res: Response) => {
  try {
    const entries = getAllTimeLeaderboard();
    res.json({
      entries,
      period: 'all-time',
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Leaderboard] All-time error:', err);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/leaderboard/profile/:userId
router.get('/profile/:userId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId) as any;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const stats = db.prepare(`
      SELECT
        MAX(wpm) as best_wpm,
        MAX(accuracy) as best_accuracy,
        COUNT(*) as total_challenges
      FROM scores WHERE user_id = ?
    `).get(req.params.userId) as any;

    const favLangs = db.prepare(`
      SELECT c.language, COUNT(*) as count
      FROM scores s JOIN challenges c ON c.id = s.challenge_id
      WHERE s.user_id = ?
      GROUP BY c.language
      ORDER BY count DESC
      LIMIT 5
    `).all(req.params.userId) as any[];

    const recentScores = db.prepare(`
      SELECT s.*, c.concept, c.language, c.difficulty
      FROM scores s JOIN challenges c ON c.id = s.challenge_id
      WHERE s.user_id = ?
      ORDER BY s.played_at DESC
      LIMIT 20
    `).all(req.params.userId);

    res.json({
      user,
      best_wpm: stats?.best_wpm || 0,
      best_accuracy: stats?.best_accuracy || 0,
      total_challenges: stats?.total_challenges || 0,
      favorite_languages: favLangs || [],
      recent_scores: recentScores || [],
      badges: [],
    });
  } catch (err) {
    console.error('[Leaderboard] Profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

export default router;

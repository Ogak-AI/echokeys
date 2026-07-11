import { getDb } from '../db/index.js';
import type { LeaderboardEntry } from '../../shared/types/index.js';
import { v4 as uuid } from 'uuid';

/**
 * Get the Monday 00:00 UTC of the current week
 */
export function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return monday.toISOString().split('T')[0]!;
}

/**
 * Get the Sunday 23:59 UTC of the current week
 */
export function getCurrentWeekEnd(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 0 : 7 - day;
  const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return sunday.toISOString().split('T')[0]!;
}

/**
 * Query weekly leaderboard (current or historical)
 */
export function getWeeklyLeaderboard(weekStart?: string, limit = 25): LeaderboardEntry[] {
  const db = getDb();
  const start = weekStart || getCurrentWeekStart();
  const end = weekStart
    ? (() => {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + 6);
        return d.toISOString().split('T')[0]!;
      })()
    : getCurrentWeekEnd();

  const rows = db.prepare(`
    SELECT
      s.user_id,
      u.username,
      MAX(s.score) as score,
      MAX(s.accuracy) as accuracy,
      MAX(s.wpm) as best_wpm,
      COUNT(*) as challenges_completed,
      MAX(s.played_at) as last_played
    FROM scores s
    JOIN users u ON u.id = s.user_id
    WHERE date(s.played_at) >= ? AND date(s.played_at) <= ?
    GROUP BY s.user_id
    ORDER BY score DESC
    LIMIT ?
  `).all(start, end, limit) as Array<{
    user_id: string;
    username: string;
    score: number;
    accuracy: number;
    best_wpm: number;
    challenges_completed: number;
    last_played: string;
  }>;

  return rows.map((row, idx) => ({
    rank: idx + 1,
    user_id: row.user_id,
    username: row.username,
    score: Math.round(row.score * 100) / 100,
    accuracy: Math.round(row.accuracy * 100) / 100,
    best_wpm: row.best_wpm,
    challenges_completed: row.challenges_completed,
    last_played: row.last_played,
  }));
}

/**
 * Get all-time leaderboard
 */
export function getAllTimeLeaderboard(limit = 100): LeaderboardEntry[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.user_id,
      u.username,
      MAX(s.score) as score,
      MAX(s.accuracy) as accuracy,
      MAX(s.wpm) as best_wpm,
      COUNT(*) as challenges_completed,
      MAX(s.played_at) as last_played
    FROM scores s
    JOIN users u ON u.id = s.user_id
    GROUP BY s.user_id
    ORDER BY score DESC
    LIMIT ?
  `).all(limit) as Array<{
    user_id: string;
    username: string;
    score: number;
    accuracy: number;
    best_wpm: number;
    challenges_completed: number;
    last_played: string;
  }>;

  return rows.map((row, idx) => ({
    rank: idx + 1,
    user_id: row.user_id,
    username: row.username,
    score: Math.round(row.score * 100) / 100,
    accuracy: Math.round(row.accuracy * 100) / 100,
    best_wpm: row.best_wpm,
    challenges_completed: row.challenges_completed,
    last_played: row.last_played,
  }));
}

/**
 * Get monthly leaderboard
 */
export function getMonthlyLeaderboard(year: number, month: number, limit = 25): LeaderboardEntry[] {
  const db = getDb();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0]!;

  const rows = db.prepare(`
    SELECT
      s.user_id,
      u.username,
      MAX(s.score) as score,
      MAX(s.accuracy) as accuracy,
      MAX(s.wpm) as best_wpm,
      COUNT(*) as challenges_completed,
      MAX(s.played_at) as last_played
    FROM scores s
    JOIN users u ON u.id = s.user_id
    WHERE date(s.played_at) >= ? AND date(s.played_at) <= ?
    GROUP BY s.user_id
    ORDER BY score DESC
    LIMIT ?
  `).all(startDate, endDate, limit) as Array<{
    user_id: string;
    username: string;
    score: number;
    accuracy: number;
    best_wpm: number;
    challenges_completed: number;
    last_played: string;
  }>;

  return rows.map((row, idx) => ({
    rank: idx + 1,
    user_id: row.user_id,
    username: row.username,
    score: Math.round(row.score * 100) / 100,
    accuracy: Math.round(row.accuracy * 100) / 100,
    best_wpm: row.best_wpm,
    challenges_completed: row.challenges_completed,
    last_played: row.last_played,
  }));
}

/**
 * Get yearly leaderboard
 */
export function getYearlyLeaderboard(year: number, limit = 50): LeaderboardEntry[] {
  const db = getDb();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const rows = db.prepare(`
    SELECT
      s.user_id,
      u.username,
      MAX(s.score) as score,
      MAX(s.accuracy) as accuracy,
      MAX(s.wpm) as best_wpm,
      COUNT(*) as challenges_completed,
      MAX(s.played_at) as last_played
    FROM scores s
    JOIN users u ON u.id = s.user_id
    WHERE date(s.played_at) >= ? AND date(s.played_at) <= ?
    GROUP BY s.user_id
    ORDER BY score DESC
    LIMIT ?
  `).all(startDate, endDate, limit) as Array<{
    user_id: string;
    username: string;
    score: number;
    accuracy: number;
    best_wpm: number;
    challenges_completed: number;
    last_played: string;
  }>;

  return rows.map((row, idx) => ({
    rank: idx + 1,
    user_id: row.user_id,
    username: row.username,
    score: Math.round(row.score * 100) / 100,
    accuracy: Math.round(row.accuracy * 100) / 100,
    best_wpm: row.best_wpm,
    challenges_completed: row.challenges_completed,
    last_played: row.last_played,
  }));
}

/**
 * Snapshot the current weekly leaderboard and archive it
 */
export function snapshotWeekly(): void {
  const db = getDb();
  const weekStart = getCurrentWeekStart();
  const weekEnd = getCurrentWeekEnd();
  const entries = getWeeklyLeaderboard(weekStart);

  if (entries.length === 0) {
    console.log('[Leaderboard] No scores this week, skipping snapshot');
    return;
  }

  // Check if snapshot already exists
  const existing = db.prepare(
    'SELECT id FROM weekly_snapshots WHERE week_start = ?'
  ).get(weekStart) as { id: string } | undefined;

  if (existing) {
    console.log(`[Leaderboard] Weekly snapshot for ${weekStart} already exists`);
    return;
  }

  db.prepare(`
    INSERT INTO weekly_snapshots (id, week_start, week_end, snapshot_data)
    VALUES (?, ?, ?, ?)
  `).run(uuid(), weekStart, weekEnd, JSON.stringify(entries));

  console.log(`[Leaderboard] Archived weekly snapshot: ${weekStart} to ${weekEnd} (${entries.length} entries)`);
}

/**
 * Snapshot monthly leaderboard
 */
export function snapshotMonthly(year: number, month: number): void {
  const db = getDb();
  const entries = getMonthlyLeaderboard(year, month);

  if (entries.length === 0) return;

  const existing = db.prepare(
    'SELECT id FROM monthly_snapshots WHERE year = ? AND month = ?'
  ).get(year, month) as { id: string } | undefined;

  if (existing) return;

  db.prepare(`
    INSERT INTO monthly_snapshots (id, year, month, snapshot_data)
    VALUES (?, ?, ?, ?)
  `).run(uuid(), year, month, JSON.stringify(entries));

  console.log(`[Leaderboard] Archived monthly snapshot: ${year}-${month} (${entries.length} entries)`);
}

/**
 * Snapshot yearly leaderboard
 */
export function snapshotYearly(year: number): void {
  const db = getDb();
  const entries = getYearlyLeaderboard(year);

  if (entries.length === 0) return;

  const existing = db.prepare(
    'SELECT id FROM yearly_snapshots WHERE year = ?'
  ).get(year) as { id: string } | undefined;

  if (existing) return;

  db.prepare(`
    INSERT INTO yearly_snapshots (id, year, snapshot_data)
    VALUES (?, ?, ?)
  `).run(uuid(), year, JSON.stringify(entries));

  console.log(`[Leaderboard] Archived yearly snapshot: ${year} (${entries.length} entries)`);
}

/**
 * Get a user's rank in the current weekly leaderboard
 */
export function getUserWeeklyRank(userId: string): number | null {
  const entries = getWeeklyLeaderboard();
  const entry = entries.find(e => e.user_id === userId);
  return entry ? entry.rank : null;
}

/**
 * Get a user's all-time rank
 */
export function getUserAllTimeRank(userId: string): number | null {
  const entries = getAllTimeLeaderboard();
  const entry = entries.find(e => e.user_id === userId);
  return entry ? entry.rank : null;
}

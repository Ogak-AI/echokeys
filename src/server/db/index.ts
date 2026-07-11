import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../../echokeys.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_played TEXT
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      concept TEXT NOT NULL,
      code TEXT NOT NULL,
      language TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
      line_count INTEGER NOT NULL,
      content_type TEXT,
      domain TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      wpm INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      time_seconds INTEGER NOT NULL,
      score REAL NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      played_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weekly_snapshots (
      id TEXT PRIMARY KEY,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      snapshot_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_snapshots (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      snapshot_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS yearly_snapshots (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      snapshot_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_scores_played ON scores(played_at);
    CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
    CREATE INDEX IF NOT EXISTS idx_challenges_lang_diff ON challenges(language, difficulty);
    CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_dates ON weekly_snapshots(week_start, week_end);
  `);

  ensureColumn('challenges', 'content_type');
  ensureColumn('challenges', 'domain');

  console.log('[DB] Schema initialized');
}

function ensureColumn(tableName: string, columnName: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT`);
    console.log(`[DB] Added column ${tableName}.${columnName}`);
  }
}

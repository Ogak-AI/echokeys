import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

const router = Router();

// POST /api/auth/register — create a new user
router.post('/register', (req: Request, res: Response) => {
  try {
    const { username } = req.body as { username?: string };
    if (!username || username.trim().length < 2 || username.trim().length > 30) {
      res.status(400).json({ error: 'Username must be 2-30 characters' });
      return;
    }

    const clean = username.trim().toLowerCase();
    const db = getDb();

    // Check if exists
    const existing = db.prepare('SELECT id, username, created_at, last_played FROM users WHERE username = ?').get(clean) as any;
    if (existing) {
      // Just log them in
      res.json({ user: existing, token: existing.id });
      return;
    }

    const id = uuid();
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(id, clean);

    const user = { id, username: clean, created_at: new Date().toISOString(), last_played: null };
    console.log(`[Auth] New user registered: ${clean}`);
    res.json({ user, token: id });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login — login with username
router.post('/login', (req: Request, res: Response) => {
  try {
    const { username } = req.body as { username?: string };
    if (!username || username.trim().length < 2) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const clean = username.trim().toLowerCase();
    const db = getDb();
    const user = db.prepare('SELECT id, username, created_at, last_played FROM users WHERE username = ?').get(clean) as any;

    if (!user) {
      res.status(404).json({ error: 'User not found. Register first.' });
      return;
    }

    res.json({ user, token: user.id });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me — get current user by token (user id)
router.get('/me', (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username, created_at, last_played FROM users WHERE id = ?').get(token) as any;

    if (!user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    res.json({ user });
  } catch (err) {
    console.error('[Auth] Me error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;

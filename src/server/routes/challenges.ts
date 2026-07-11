import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { generateCode } from '../services/codeGenerator.js';
import { generateChallengeContent } from '../services/challengeContent.js';
import { v4 as uuid } from 'uuid';
import type { Language, Difficulty } from '../../shared/types/index.js';

const router = Router();

const VALID_LANGUAGES: Language[] = ['python', 'javascript', 'typescript', 'go', 'rust', 'java', 'c', 'cpp'];
const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

// POST /api/challenges/generate — generate a new code challenge
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { concept, language, difficulty, contentType, domain } = req.body as {
      concept?: string;
      language?: Language;
      difficulty?: Difficulty;
      contentType?: string;
      domain?: string;
    };

    if (!concept || concept.trim().length < 5) {
      res.status(400).json({ error: 'Concept must be at least 5 characters' });
      return;
    }
    if (!language || !VALID_LANGUAGES.includes(language)) {
      res.status(400).json({ error: `Invalid language. Choose: ${VALID_LANGUAGES.join(', ')}` });
      return;
    }
    if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty)) {
      res.status(400).json({ error: 'Invalid difficulty. Choose: easy, medium, hard' });
      return;
    }

    console.log(`[Challenge] Generating: "${concept}" in ${language} (${difficulty})`);

    let code: string;
    let lineCount: number;
    let challengeLanguage: Language = language;

    if (contentType && contentType !== 'code') {
      const generated = generateChallengeContent(concept.trim(), contentType, domain, difficulty, language);
      code = generated.text;
      lineCount = generated.lineCount;
      challengeLanguage = language || 'python';
    } else {
      const generated = await generateCode(concept.trim(), language, difficulty);
      code = generated.code;
      lineCount = generated.lineCount;
      challengeLanguage = language;
    }

    const id = uuid();
    const db = getDb();
    db.prepare(`
      INSERT INTO challenges (id, concept, code, language, difficulty, line_count, content_type, domain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, concept.trim(), code, challengeLanguage, difficulty, lineCount, contentType || 'code', domain?.trim() || null);

    const challenge = {
      id,
      concept: concept.trim(),
      code,
      language: challengeLanguage,
      difficulty,
      line_count: lineCount,
      content_type: contentType || 'code',
      domain: domain?.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    console.log(`[Challenge] Created: ${id} (${lineCount} lines)`);
    res.json({ challenge });
  } catch (err: any) {
    console.error('[Challenge] Generate error:', err);
    res.status(500).json({ error: err.message || 'Code generation failed' });
  }
});

// GET /api/challenges/:id — get a specific challenge
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);

    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    res.json({ challenge });
  } catch (err) {
    console.error('[Challenge] Get error:', err);
    res.status(500).json({ error: 'Failed to get challenge' });
  }
});

export default router;

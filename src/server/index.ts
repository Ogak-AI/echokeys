import {
  createServer,
  context,
  getServerPort,
  redis,
  realtime,
  reddit,
  settings,
} from '@devvit/web/server';
import type { UiResponse } from '@devvit/shared';
import express from 'express';
import { generateContent } from './services/contentGenerator.js';
import {
  saveScore,
  saveChallenge,
  getChallenge,
  getWeeklyLeaderboard,
  getMonthlyLeaderboard,
  getYearlyLeaderboard,
  getAllTimeLeaderboard,
  getPlayerProfile,
  getPlayerScores,
  getPlayerWeeklyRank,
  snapshotWeekly,
  snapshotMonthly,
  snapshotYearly,
  enrichPlayerBadges,
  weekStartKey,
} from './services/leaderboard.js';
import { broadcastWeeklyLeaderboard } from './services/realtime.js';
import { calculateScore, DIFFICULTY_CONFIG } from '../shared/types/index.js';
import type { Challenge, Difficulty, PlayerScore, LeaderboardEntry } from '../shared/types/index.js';
import { memoryCache } from './services/memoryCache.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

async function getLlmConfig() {
  const provider = (await settings.get<string>('llm_provider')) || 'huggingface';
  const hfKey = (await settings.get<string>('huggingface_api_key')) || process.env.HUGGINGFACE_API_KEY || '';
  const hfModel = (await settings.get<string>('huggingface_model')) || 'Qwen/Qwen2.5-Coder-7B-Instruct';
  const groqKey = (await settings.get<string>('groq_api_key')) || process.env.GROQ_API_KEY || '';
  const groqModel = (await settings.get<string>('groq_model')) || 'llama-3.3-70b-versatile';
  const claudeKey = (await settings.get<string>('anthropic_api_key')) || process.env.ANTHROPIC_API_KEY || '';
  const claudeModel = (await settings.get<string>('anthropic_model')) || 'claude-3-5-sonnet-20241022';

  return {
    provider,
    huggingface: { apiKey: hfKey, model: hfModel },
    groq: { apiKey: groqKey, model: groqModel },
    anthropic: { apiKey: claudeKey, model: claudeModel }
  };
}

function getSubredditId(): string {
  return context.subredditId || 'global';
}

async function getSubredditName(): Promise<string> {
  if (context.subredditName) return context.subredditName;
  try {
    const sub = await reddit.getCurrentSubreddit();
    if (sub?.name) return sub.name;
  } catch {
    // local testing or fallback
  }
  return 'r/echokeys';
}

async function resolveUsername(): Promise<string> {
  if (context.username) return context.username.toLowerCase();
  try {
    const name = await reddit.getCurrentUsername();
    if (name) return name.toLowerCase();
  } catch {
    // unauthenticated / system call
  }
  return 'anonymous';
}

async function checkRateLimit(username: string, action: string, maxCount: number): Promise<boolean> {
  if (username === 'anonymous') return true;
  const hourKey = Math.floor(Date.now() / 3600000);
  const key = `ratelimit:${action}:${username}:${hourKey}`;
  const raw = await redis.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= maxCount) {
    return false;
  }
  await redis.set(key, String(count + 1));
  return true;
}

function didLeaderboardChange(a: LeaderboardEntry[], b: LeaderboardEntry[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.username !== b[i]?.username || a[i]?.score !== b[i]?.score) {
      return true;
    }
  }
  return false;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseDifficulty(value: unknown): Difficulty | null {
  if (typeof value === 'string' && ['easy', 'medium', 'hard'].includes(value)) {
    return value as Difficulty;
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && ['easy', 'medium', 'hard'].includes(value[0])) {
    return value[0] as Difficulty;
  }
  return null;
}

async function createChallengeFromPrompt(
  prompt: string,
  difficulty: Difficulty,
  createdBy: string
): Promise<Challenge> {
  const config = await getLlmConfig();
  const { content, lineCount, domain } = await generateContent(prompt, difficulty, config);

  const challenge: Challenge = {
    id: newId('ch'),
    prompt,
    content,
    difficulty,
    domain,
    lineCount,
    createdAt: Date.now(),
    createdBy,
  };

  await saveChallenge(redis, challenge);
  const cacheKey = `prompt_cache:${prompt.toLowerCase()}:${difficulty}`;
  await redis.set(cacheKey, JSON.stringify(challenge));
  return challenge;
}

// ---- Health ----
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    week: weekStartKey(),
  });
});

// ---- Me ----
app.get('/api/me', async (_req, res) => {
  try {
    const username = await resolveUsername();
    const profile = username !== 'anonymous' ? await getPlayerProfile(redis, username) : null;
    return res.json({
      username,
      postId: context.postId,
      postData: context.postData ?? null,
      profile,
      subredditId: getSubredditId(),
      subredditName: await getSubredditName(),
    });
  } catch (err) {
    console.error('[API] /api/me error:', err);
    return res.status(500).json({ error: 'Failed to resolve user' });
  }
});

// ---- Content Generation ----
app.post('/api/challenge/generate', async (req, res) => {
  try {
    const { prompt: rawPrompt, difficulty: rawDifficulty } = req.body as {
      prompt?: string;
      difficulty?: Difficulty;
    };

    if (!rawPrompt || rawPrompt.trim().length < 3) {
      return res.status(400).json({ error: 'Prompt must be at least 3 characters' });
    }

    const difficulty = parseDifficulty(rawDifficulty);
    if (!difficulty) {
      return res.status(400).json({ error: 'Invalid difficulty' });
    }

    const username = await resolveUsername();

    // Rate Limit: Max 5 prompt generations per hour per user
    const allowed = await checkRateLimit(username, 'generate', 5);
    if (!allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded: Max 5 prompt generations per hour' });
    }

    const prompt = rawPrompt.trim();
    const cacheKey = `prompt_cache:${prompt.toLowerCase()}:${difficulty}`;
    const cachedRaw = await redis.get(cacheKey);

    if (cachedRaw) {
      try {
        const cachedChallenge = JSON.parse(cachedRaw) as Challenge;
        const challenge: Challenge = {
          ...cachedChallenge,
          id: newId('ch'),
          createdAt: Date.now(),
          createdBy: username,
        };
        await saveChallenge(redis, challenge);
        console.log(`[API] Prompt cache hit for "${prompt}" (${difficulty})`);
        return res.json({ challenge });
      } catch {}
    }

    const challenge = await createChallengeFromPrompt(prompt, difficulty, username);
    return res.json({ challenge });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    console.error('[API] Generate error:', err);
    return res.status(500).json({ error: message });
  }
});

// ---- Get Challenge ----
app.get('/api/challenge/:id', async (req, res) => {
  try {
    const challenge = await getChallenge(redis, req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    return res.json({ challenge });
  } catch (err) {
    console.error('[API] Get challenge error:', err);
    return res.status(500).json({ error: 'Failed to get challenge' });
  }
});

// Load challenge attached to the current custom post (if any)
app.get('/api/post/challenge', async (_req, res) => {
  try {
    const postData = context.postData as { challengeId?: string } | undefined;
    const challengeId = postData?.challengeId;
    if (!challengeId) {
      return res.json({ challenge: null });
    }
    const challenge = await getChallenge(redis, challengeId);
    return res.json({ challenge });
  } catch (err) {
    console.error('[API] Post challenge error:', err);
    return res.status(500).json({ error: 'Failed to load post challenge' });
  }
});

// ---- Submit Score ----
app.post('/api/score/submit', async (req, res) => {
  try {
    const body = req.body as {
      username?: string;
      challengeId?: string;
      wpm?: number;
      accuracy?: number;
      timeSeconds?: number;
      completed?: boolean;
    };

    const player = (body.username || (await resolveUsername())).toLowerCase();

    if (!body.challengeId || body.wpm == null || body.accuracy == null || body.timeSeconds == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (body.wpm < 0 || body.accuracy < 0 || body.accuracy > 100 || body.timeSeconds < 0) {
      return res.status(400).json({ error: 'Invalid score values' });
    }

    // Rate Limit: Max 60 score submissions per hour per user
    const allowed = await checkRateLimit(player, 'submit', 60);
    if (!allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded: Max 60 score submissions per hour' });
    }

    if (body.wpm > 420) {
      return res.status(400).json({ error: 'WPM exceeds maximum limit of 420 WPM (7 words per second)' });
    }

    const challenge = (await getChallenge(redis, body.challengeId)) as Challenge | null;
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Server Score & WPM Validation:
    if (body.completed) {
      const contentLength = challenge.content.length;
      const mins = body.timeSeconds / 60;
      const expectedWpm = mins > 0 ? Math.round((contentLength / 5) / mins) : 0;
      // Allow a reasonable tolerance of 5 WPM for typing/timer differences
      if (Math.abs(body.wpm - expectedWpm) > 5) {
        return res.status(400).json({ error: 'Score validation failed: WPM mismatch' });
      }
    }

    const totalWords = challenge.content.split(/\s+/).filter(Boolean).length || 0;
    const wordsTyped = body.completed ? totalWords : Math.min(totalWords, Math.round(body.wpm * (body.timeSeconds / 60)));

    const scoreValue = calculateScore(body.accuracy / 100, body.wpm, body.timeSeconds);
    const id = newId('sc');
    const subId = getSubredditId();

    const playerScore: PlayerScore = {
      id,
      username: player,
      challengeId: body.challengeId,
      prompt: challenge.prompt,
      domain: challenge.domain,
      wpm: body.wpm,
      accuracy: body.accuracy,
      timeSeconds: body.timeSeconds,
      score: scoreValue,
      completed: !!body.completed,
      playedAt: Date.now(),
      communityId: subId,
      wordsTyped,
    };

    // Retrieve previous leaderboard entries before saving to compare changes
    const previousEntries = await getWeeklyLeaderboard(redis, subId);

    await saveScore(redis, playerScore);

    const weeklyRank = await getPlayerWeeklyRank(redis, subId, player);
    const entries = await enrichPlayerBadges(redis, await getWeeklyLeaderboard(redis, subId));

    // WebSocket optimization: Only broadcast if the top 25 entries or ranks actually changed
    const broadcastKey = `lb_weekly_last_broadcast:${subId}`;
    const lastBroadcastStr = memoryCache.get<string>(broadcastKey);
    const lastBroadcast = lastBroadcastStr ? JSON.parse(lastBroadcastStr) as LeaderboardEntry[] : previousEntries;

    if (didLeaderboardChange(lastBroadcast, entries)) {
      memoryCache.set(broadcastKey, JSON.stringify(entries), 60000); // cache for 1 minute
      await broadcastWeeklyLeaderboard(realtime, subId, entries, weekStartKey());
      console.log(`[WebSocket] Broadcasted updated weekly leaderboard for subreddit ${subId}`);
    }

    console.log(
      `[API] Score submitted: ${player} — WPM:${body.wpm} Acc:${body.accuracy}% Score:${scoreValue} Words:${wordsTyped}`
    );

    return res.json({ score: playerScore, weeklyRank, allTimeRank: null });
  } catch (err) {
    console.error('[API] Submit score error:', err);
    return res.status(500).json({ error: 'Failed to submit score' });
  }
});

// ---- Leaderboards ----
app.get('/api/leaderboard/weekly', async (_req, res) => {
  try {
    const entries = await enrichPlayerBadges(redis, await getWeeklyLeaderboard(redis, getSubredditId()));
    return res.json({ entries, period: weekStartKey(), updatedAt: Date.now() });
  } catch (err) {
    console.error('[API] Weekly leaderboard error:', err);
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

app.get('/api/leaderboard/weekly/:weekStart', async (req, res) => {
  try {
    const weekStart = req.params.weekStart;
    const entries = await enrichPlayerBadges(redis, await getWeeklyLeaderboard(redis, getSubredditId(), weekStart));
    return res.json({ entries, period: weekStart, updatedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

app.get('/api/leaderboard/monthly/:yearMonth', async (req, res) => {
  try {
    const yearMonth = req.params.yearMonth;
    const entries = await enrichPlayerBadges(redis, await getMonthlyLeaderboard(redis, getSubredditId(), yearMonth));
    return res.json({ entries, period: yearMonth, updatedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

app.get('/api/leaderboard/yearly/:year', async (req, res) => {
  try {
    const year = req.params.year;
    const entries = await enrichPlayerBadges(redis, await getYearlyLeaderboard(redis, getSubredditId(), year));
    return res.json({ entries, period: year, updatedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

app.get('/api/leaderboard/all-time', async (_req, res) => {
  try {
    const entries = await enrichPlayerBadges(redis, await getAllTimeLeaderboard(redis, getSubredditId()));
    return res.json({ entries, period: 'all-time', updatedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// ---- Profile ----
app.get('/api/profile/:username', async (req, res) => {
  try {
    const username = (req.params.username ?? '').toLowerCase();
    if (!username) return res.status(400).json({ error: 'Username required' });

    const profile = await getPlayerProfile(redis, username);
    if (!profile) {
      return res.status(404).json({ error: 'Player profile not found' });
    }
    const scores = await getPlayerScores(redis, username);
    const weeklyRank = await getPlayerWeeklyRank(redis, getSubredditId(), username);
    return res.json({ profile, recentScores: scores, weeklyRank });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get profile' });
  }
});

// ---- Menu: open create-challenge form ----
app.post('/internal/menu/create-challenge', async (_req, res) => {
  const response: UiResponse = {
    showForm: {
      name: 'create-challenge',
      form: {
        title: 'Create Echokeys Challenge',
        description: 'Enter a prompt. Claude generates the typing content and posts it to this subreddit.',
        acceptLabel: 'Generate & Post',
        cancelLabel: 'Cancel',
        fields: [
          {
            type: 'paragraph',
            name: 'prompt',
            label: 'Prompt',
            helpText:
              'Examples: "Build a recursive function", "Write a legal brief opening", "Draft marketing copy for a productivity app"',
            required: true,
          },
          {
            type: 'select',
            name: 'difficulty',
            label: 'Difficulty',
            required: true,
            defaultValue: ['medium'],
            options: [
              {
                label: `Easy — ${DIFFICULTY_CONFIG.easy.minLines}–${DIFFICULTY_CONFIG.easy.maxLines} lines, 10 min`,
                value: 'easy',
              },
              {
                label: `Medium — ${DIFFICULTY_CONFIG.medium.minLines}–${DIFFICULTY_CONFIG.medium.maxLines} lines, 8 min`,
                value: 'medium',
              },
              {
                label: `Hard — ${DIFFICULTY_CONFIG.hard.minLines}–${DIFFICULTY_CONFIG.hard.maxLines}+ lines, 5 min`,
                value: 'hard',
              },
            ],
          },
        ],
      },
    },
  };
  return res.json(response);
});

// ---- Form submit: generate content + create custom post ----
app.post('/internal/form/create-challenge', async (req, res) => {
  try {
    const values = req.body as { prompt?: string; difficulty?: string | string[] };
    const prompt = (values.prompt ?? '').trim();
    const difficulty = parseDifficulty(values.difficulty);

    if (prompt.length < 3) {
      const response: UiResponse = {
        showToast: { text: 'Prompt must be at least 3 characters.', appearance: 'neutral' },
      };
      return res.json(response);
    }
    if (!difficulty) {
      const response: UiResponse = {
        showToast: { text: 'Please pick a difficulty.', appearance: 'neutral' },
      };
      return res.json(response);
    }

    const username = await resolveUsername();
    const challenge = await createChallengeFromPrompt(prompt, difficulty, username);

    const subredditName = context.subredditName || (await reddit.getCurrentSubreddit()).name;
    const titlePrompt = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
    const title = `Echokeys [${difficulty.toUpperCase()}]: ${titlePrompt}`;

     const post = await reddit.submitCustomPost({
      subredditName,
      title,
      entry: 'default',
      postData: {
        challengeId: challenge.id,
        difficulty: challenge.difficulty,
        domain: challenge.domain,
        prompt: challenge.prompt,
        createdBy: username,
      },
      textFallback: {
        text: `Echokeys typing challenge (${difficulty}): ${prompt}`,
      },
      runAs: 'USER',
      userGeneratedContent: {
        text: prompt,
      },
    });

    challenge.postId = post.id;
    await saveChallenge(redis, challenge);

    const response: UiResponse = {
      navigateTo: post.url,
      showToast: { text: 'Challenge posted! Good luck.', appearance: 'success' },
    };
    // navigateTo and showForm are mutually exclusive; toast+navigate may not both apply —
    // prefer navigateTo for the primary UX.
    return res.json({ navigateTo: post.url } satisfies UiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create challenge';
    console.error('[Menu] Create challenge error:', err);
    const response: UiResponse = {
      showToast: { text: message, appearance: 'neutral' },
    };
    return res.json(response);
  }
});

// ---- Install + Scheduler Endpoints ----
app.post('/internal/on-app-install', async (_req, res) => {
  console.log('[Echokeys] App installed. Cron jobs registered via devvit.json scheduler.');
  return res.json({ ok: true });
});

app.post('/internal/weekly-snapshot', async (_req, res) => {
  try {
    const subId = getSubredditId();
    const subName = await getSubredditName();
    await snapshotWeekly(redis, subId, subName);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Weekly snapshot failed';
    console.error('[Scheduler] Weekly snapshot error:', err);
    return res.status(500).json({ error: message });
  }
});

app.post('/internal/monthly-snapshot', async (_req, res) => {
  try {
    const subId = getSubredditId();
    const subName = await getSubredditName();
    await snapshotMonthly(redis, subId, subName);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Monthly snapshot failed';
    console.error('[Scheduler] Monthly snapshot error:', err);
    return res.status(500).json({ error: message });
  }
});

app.post('/internal/yearly-snapshot', async (_req, res) => {
  try {
    const subId = getSubredditId();
    const subName = await getSubredditName();
    await snapshotYearly(redis, subId, subName);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Yearly snapshot failed';
    console.error('[Scheduler] Yearly snapshot error:', err);
    return res.status(500).json({ error: message });
  }
});

const server = createServer(app);
server.listen(getServerPort());
export default server;

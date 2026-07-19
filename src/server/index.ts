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
  getPlayerAllTimeRank,
  snapshotWeekly,
  snapshotMonthly,
  snapshotYearly,
  enrichPlayerBadges,
  weekStartKey,
} from './services/leaderboard.js';
import { broadcastWeeklyLeaderboard } from './services/realtime.js';
import { calculateScore } from '../shared/types/index.js';
import type { Challenge, PlayerScore, LeaderboardEntry } from '../shared/types/index.js';
import { memoryCache } from './services/memoryCache.js';
import {
  MAX_WPM,
  TIME_LIMIT_SECONDS,
  WPM_TOLERANCE,
  calculateWpm,
  countWords,
  formatSubredditLabel,
  sanitizePrompt,
} from '../shared/utils/antiCheat.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

async function getLlmConfig() {
  const provider = (await settings.get<string>('llm_provider')) || 'huggingface';
  const hfKey =
    (await settings.get<string>('huggingface_api_key')) || process.env.HUGGINGFACE_API_KEY || '';
  const hfModel =
    (await settings.get<string>('huggingface_model')) || 'Qwen/Qwen2.5-Coder-7B-Instruct';
  const groqKey = (await settings.get<string>('groq_api_key')) || process.env.GROQ_API_KEY || '';
  const groqModel = (await settings.get<string>('groq_model')) || 'llama-3.3-70b-versatile';

  return {
    provider,
    huggingface: { apiKey: hfKey, model: hfModel },
    groq: { apiKey: groqKey, model: groqModel },
  };
}

function getSubredditId(): string {
  return context.subredditId || 'global';
}

async function getSubredditName(): Promise<string> {
  if (context.subredditName) return formatSubredditLabel(context.subredditName);
  try {
    const sub = await reddit.getCurrentSubreddit();
    if (sub?.name) return formatSubredditLabel(sub.name);
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
  const identity = username === 'anonymous' ? `anon:${getSubredditId()}` : username;
  const hourKey = Math.floor(Date.now() / 3600000);
  const key = `ratelimit:${action}:${identity}:${hourKey}`;
  const raw = await redis.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= maxCount) return false;
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

type CachedPromptContent = {
  content: string;
  domain: Challenge['domain'];
  lineCount: number;
};

async function createChallengeFromPrompt(prompt: string, createdBy: string): Promise<Challenge> {
  const subId = getSubredditId();
  const cacheKey = `prompt_cache:${subId}:${prompt.toLowerCase()}`;

  let content = '';
  let domain: Challenge['domain'] = 'prose';
  let lineCount = 0;
  let fromCache = false;

  const memHit = memoryCache.get<CachedPromptContent>(cacheKey);
  if (memHit) {
    content = memHit.content;
    domain = memHit.domain;
    lineCount = memHit.lineCount;
    fromCache = true;
  } else {
    const cachedRaw = await redis.get(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as CachedPromptContent;
        content = cached.content;
        domain = cached.domain;
        lineCount = cached.lineCount;
        fromCache = true;
        memoryCache.set(cacheKey, cached, 3600000);
      } catch {
        // corrupt cache — regenerate
      }
    }
  }

  if (!fromCache || !content) {
    const config = await getLlmConfig();
    const generated = await generateContent(prompt, config);
    content = generated.content;
    domain = generated.domain;
    lineCount = generated.lineCount;
    const payload: CachedPromptContent = { content, domain, lineCount };
    await redis.set(cacheKey, JSON.stringify(payload));
    memoryCache.set(cacheKey, payload, 3600000);
  } else {
    console.log(`[API] Prompt cache hit for "${prompt.slice(0, 60)}"`);
  }

  const challenge: Challenge = {
    id: newId('ch'),
    prompt,
    content,
    domain,
    lineCount,
    createdAt: Date.now(),
    createdBy,
    communityId: subId,
  };

  await saveChallenge(redis, challenge);
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

// ---- Content Generation (in-app free play) ----
app.post('/api/challenge/generate', async (req, res) => {
  try {
    const { prompt: rawPrompt } = req.body as { prompt?: string };

    if (!rawPrompt || typeof rawPrompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const prompt = sanitizePrompt(rawPrompt);
    if (prompt.length < 3) {
      return res.status(400).json({ error: 'Prompt must be at least 3 characters' });
    }

    const username = await resolveUsername();
    const allowed = await checkRateLimit(username, 'generate', 5);
    if (!allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded: max 5 prompt generations per hour',
      });
    }

    const challenge = await createChallengeFromPrompt(prompt, username);
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

// Load challenge attached to the current custom post
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
      challengeId?: string;
      wpm?: number;
      accuracy?: number;
      timeSeconds?: number;
      completed?: boolean;
    };

    // Identity from Reddit OAuth context only — never trust client username
    const player = await resolveUsername();
    if (player === 'anonymous') {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!body.challengeId || body.wpm == null || body.accuracy == null || body.timeSeconds == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (
      typeof body.wpm !== 'number' ||
      typeof body.accuracy !== 'number' ||
      typeof body.timeSeconds !== 'number' ||
      !Number.isFinite(body.wpm) ||
      !Number.isFinite(body.accuracy) ||
      !Number.isFinite(body.timeSeconds) ||
      body.wpm < 0 ||
      body.accuracy < 0 ||
      body.accuracy > 100 ||
      body.timeSeconds < 0
    ) {
      return res.status(400).json({ error: 'Invalid score values' });
    }

    const timeSeconds = Math.min(Math.max(0, Math.round(body.timeSeconds)), TIME_LIMIT_SECONDS);
    const claimedWpm = Math.round(body.wpm);
    const accuracy = Math.round(body.accuracy);
    const completed = !!body.completed;

    const allowed = await checkRateLimit(player, 'submit', 60);
    if (!allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded: max 60 score submissions per hour',
      });
    }

    // Hard ceiling: 7 words/sec = 420 WPM
    if (claimedWpm > MAX_WPM) {
      console.warn(`[Security] Rejected impossible WPM ${claimedWpm} from ${player}`);
      return res.status(400).json({
        error: `WPM exceeds maximum of ${MAX_WPM} (7 words per second)`,
      });
    }

    const challenge = await getChallenge(redis, body.challengeId);
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Server recalculates WPM from content length + claimed time
    let acceptedWpm = claimedWpm;
    if (completed) {
      if (timeSeconds < 1) {
        return res.status(400).json({ error: 'Score validation failed: invalid duration' });
      }
      const expectedWpm = calculateWpm(challenge.content.length, timeSeconds);
      if (Math.abs(claimedWpm - expectedWpm) > WPM_TOLERANCE) {
        console.warn(
          `[Security] WPM mismatch for ${player}: claimed=${claimedWpm} expected=${expectedWpm}`
        );
        return res.status(400).json({ error: 'Score validation failed: WPM mismatch' });
      }
      acceptedWpm = expectedWpm;
    } else {
      // Incomplete / timeout: cap at theoretical max for elapsed time
      const maxPossible = calculateWpm(challenge.content.length, Math.max(timeSeconds, 1));
      if (claimedWpm > maxPossible + WPM_TOLERANCE) {
        console.warn(
          `[Security] Incomplete WPM too high for ${player}: claimed=${claimedWpm} max=${maxPossible}`
        );
        acceptedWpm = Math.min(claimedWpm, maxPossible);
      }
    }

    if (acceptedWpm >= 120) {
      console.log(
        `[Monitor] High WPM: ${player} WPM=${acceptedWpm} Acc=${accuracy}% challenge=${body.challengeId}`
      );
    }

    const totalWords = countWords(challenge.content);
    const wordsTyped = completed
      ? totalWords
      : Math.min(totalWords, Math.max(0, Math.round(acceptedWpm * (timeSeconds / 60))));

    // Server-side score + timestamp only
    const scoreValue = calculateScore(accuracy / 100, acceptedWpm, timeSeconds);
    const id = newId('sc');
    const subId = getSubredditId();

    const playerScore: PlayerScore = {
      id,
      username: player,
      challengeId: body.challengeId,
      prompt: challenge.prompt,
      domain: challenge.domain,
      wpm: acceptedWpm,
      accuracy,
      timeSeconds,
      score: scoreValue,
      completed,
      playedAt: Date.now(),
      communityId: subId,
      wordsTyped,
    };

    const previousEntries = await getWeeklyLeaderboard(redis, subId);
    await saveScore(redis, playerScore);

    const weeklyRank = await getPlayerWeeklyRank(redis, subId, player);
    const allTimeRank = await getPlayerAllTimeRank(redis, subId, player);
    const entries = await enrichPlayerBadges(redis, await getWeeklyLeaderboard(redis, subId));

    // Live updates only when top-25 ranking actually changes
    const broadcastKey = `lb_weekly_last_broadcast:${subId}`;
    const lastBroadcastStr = memoryCache.get<string>(broadcastKey);
    const lastBroadcast = lastBroadcastStr
      ? (JSON.parse(lastBroadcastStr) as LeaderboardEntry[])
      : previousEntries;

    if (didLeaderboardChange(lastBroadcast, entries)) {
      memoryCache.set(broadcastKey, JSON.stringify(entries), 60000);
      await broadcastWeeklyLeaderboard(realtime, subId, entries, weekStartKey());
      console.log(`[Realtime] Broadcasted weekly leaderboard for ${subId}`);
    }

    console.log(
      `[API] Score submitted: ${player} — WPM:${acceptedWpm} Acc:${accuracy}% Score:${scoreValue} Words:${wordsTyped}`
    );

    return res.json({ score: playerScore, weeklyRank, allTimeRank });
  } catch (err) {
    console.error('[API] Submit score error:', err);
    return res.status(500).json({ error: 'Failed to submit score' });
  }
});

// ---- Leaderboards (community-scoped) ----
app.get('/api/leaderboard/weekly', async (_req, res) => {
  try {
    const entries = await enrichPlayerBadges(
      redis,
      await getWeeklyLeaderboard(redis, getSubredditId())
    );
    return res.json({ entries, period: weekStartKey(), updatedAt: Date.now() });
  } catch (err) {
    console.error('[API] Weekly leaderboard error:', err);
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

app.get('/api/leaderboard/weekly/:weekStart', async (req, res) => {
  try {
    const weekStart = req.params.weekStart;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ error: 'Invalid week key (use YYYY-MM-DD)' });
    }
    const entries = await enrichPlayerBadges(
      redis,
      await getWeeklyLeaderboard(redis, getSubredditId(), weekStart)
    );
    return res.json({ entries, period: weekStart, updatedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

app.get('/api/leaderboard/monthly/:yearMonth', async (req, res) => {
  try {
    const yearMonth = req.params.yearMonth;
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return res.status(400).json({ error: 'Invalid month key (use YYYY-MM)' });
    }
    const entries = await enrichPlayerBadges(
      redis,
      await getMonthlyLeaderboard(redis, getSubredditId(), yearMonth)
    );
    return res.json({ entries, period: yearMonth, updatedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

app.get('/api/leaderboard/yearly/:year', async (req, res) => {
  try {
    const year = req.params.year;
    if (!/^\d{4}$/.test(year)) {
      return res.status(400).json({ error: 'Invalid year key (use YYYY)' });
    }
    const entries = await enrichPlayerBadges(
      redis,
      await getYearlyLeaderboard(redis, getSubredditId(), year)
    );
    return res.json({ entries, period: year, updatedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

app.get('/api/leaderboard/all-time', async (_req, res) => {
  try {
    const entries = await enrichPlayerBadges(
      redis,
      await getAllTimeLeaderboard(redis, getSubredditId())
    );
    return res.json({ entries, period: 'all-time', updatedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// ---- Profile ----
app.get('/api/profile/:username', async (req, res) => {
  try {
    const username = (req.params.username ?? '').toLowerCase().replace(/[^a-z0-9_\-]/g, '');
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
        description:
          'Enter a prompt. The app generates the typing content and posts it to this subreddit.',
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
        ],
      },
    },
  };
  return res.json(response);
});

// ---- Form submit: generate content + create custom post ----
app.post('/internal/form/create-challenge', async (req, res) => {
  try {
    const values = req.body as { prompt?: string };
    const prompt = sanitizePrompt(values.prompt ?? '');

    if (prompt.length < 3) {
      return res.json({
        showToast: { text: 'Prompt must be at least 3 characters.', appearance: 'neutral' },
      } satisfies UiResponse);
    }

    const username = await resolveUsername();
    const allowed = await checkRateLimit(username, 'generate', 5);
    if (!allowed) {
      return res.json({
        showToast: {
          text: 'Rate limit: max 5 challenges per hour.',
          appearance: 'neutral',
        },
      } satisfies UiResponse);
    }

    const challenge = await createChallengeFromPrompt(prompt, username);

    const rawSubName = context.subredditName || (await reddit.getCurrentSubreddit()).name;
    const subredditName = rawSubName.replace(/^r\//i, '');
    const titlePrompt = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
    const title = `Echokeys: ${titlePrompt}`;

    const post = await reddit.submitCustomPost({
      subredditName,
      title,
      entry: 'default',
      postData: {
        challengeId: challenge.id,
        domain: challenge.domain,
        prompt: challenge.prompt,
        createdBy: username,
      },
      textFallback: {
        text: `Echokeys typing challenge: ${prompt}`,
      },
      runAs: 'USER',
      userGeneratedContent: {
        text: prompt,
      },
    });

    challenge.postId = post.id;
    await saveChallenge(redis, challenge);

    return res.json({ navigateTo: post.url } satisfies UiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create challenge';
    console.error('[Menu] Create challenge error:', err);
    return res.json({
      showToast: { text: message, appearance: 'neutral' },
    } satisfies UiResponse);
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

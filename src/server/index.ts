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
  RACE_TTL_MS,
  formatSubredditLabel,
  raceElapsedSeconds,
  sanitizePrompt,
  validatePlayMetrics,
} from '../shared/utils/antiCheat.js';
import { detectContentDomain } from '../shared/utils/contentDomain.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

type RaceSession = {
  id: string;
  username: string;
  challengeId: string;
  startedAt: number;
};

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

/**
 * Hour-bucket rate limit. Count is re-read after write to reduce concurrent overshoot
 * (Devvit Redis surface is get/set only — not fully atomic, but tighter than before).
 */
async function checkRateLimit(username: string, action: string, maxCount: number): Promise<boolean> {
  const identity = username === 'anonymous' ? `anon:${getSubredditId()}` : username;
  const hourKey = Math.floor(Date.now() / 3600000);
  const key = `ratelimit:${action}:${identity}:${hourKey}`;
  const raw = await redis.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (!Number.isFinite(count) || count >= maxCount) return false;
  const next = count + 1;
  await redis.set(key, String(next));
  // Best-effort double-check: if another writer raced past the cap, reject latecomers.
  const confirmRaw = await redis.get(key);
  const confirmed = confirmRaw ? parseInt(confirmRaw, 10) : next;
  if (Number.isFinite(confirmed) && confirmed > maxCount + 2) {
    return false;
  }
  return true;
}

async function createRaceSession(username: string, challengeId: string): Promise<RaceSession> {
  const session: RaceSession = {
    id: newId('race'),
    username,
    challengeId,
    startedAt: Date.now(),
  };
  await redis.set(`race:${session.id}`, JSON.stringify(session));
  // Soft index so a player cannot hold unlimited open races on one challenge.
  await redis.set(`race_open:${username}:${challengeId}`, session.id);
  return session;
}

type RaceLookupResult =
  | { ok: true; session: RaceSession }
  | { ok: false; error: string; status: number };

type StoredRace = RaceSession & { claimToken?: string };

function parseRaceSession(raw: string): StoredRace | null {
  try {
    return JSON.parse(raw) as StoredRace;
  } catch {
    return null;
  }
}

function validateRaceOwnership(
  session: StoredRace,
  username: string,
  challengeId: string
): RaceLookupResult {
  if (session.claimToken) {
    return { ok: false, error: 'Race session already claimed', status: 409 };
  }
  if (session.username !== username) {
    return { ok: false, error: 'Race session does not belong to this user', status: 403 };
  }
  if (session.challengeId !== challengeId) {
    return { ok: false, error: 'Race session does not match challenge', status: 400 };
  }
  if (Date.now() - session.startedAt > RACE_TTL_MS) {
    return { ok: false, error: 'Race session expired', status: 400 };
  }
  return {
    ok: true,
    session: {
      id: session.id,
      username: session.username,
      challengeId: session.challengeId,
      startedAt: session.startedAt,
    },
  };
}

/** Read-only race lookup (does not consume). Used before metric validation. */
async function loadRaceSession(
  raceId: string,
  username: string,
  challengeId: string
): Promise<RaceLookupResult> {
  if (!raceId || typeof raceId !== 'string') {
    return { ok: false, error: 'Race session required', status: 400 };
  }

  const raw = await redis.get(`race:${raceId}`);
  if (!raw) {
    return { ok: false, error: 'Race session not found or already used', status: 400 };
  }

  const stored = parseRaceSession(raw);
  if (!stored) {
    await redis.del(`race:${raceId}`);
    return { ok: false, error: 'Race session corrupt', status: 400 };
  }

  const checked = validateRaceOwnership(stored, username, challengeId);
  if (!checked.ok && checked.error === 'Race session expired') {
    await redis.del(`race:${raceId}`);
    const openKey = `race_open:${stored.username}:${stored.challengeId}`;
    const openId = await redis.get(openKey);
    if (openId === raceId) await redis.del(openKey);
  }
  return checked;
}

/**
 * One-shot claim after metrics pass.
 * Claim-token write/read so concurrent submits cannot both score the same race
 * (Devvit Redis has no WATCH/MULTI).
 */
async function claimRaceSession(session: RaceSession): Promise<RaceLookupResult> {
  const raceId = session.id;
  const raw = await redis.get(`race:${raceId}`);
  if (!raw) {
    return { ok: false, error: 'Race session not found or already used', status: 400 };
  }

  const stored = parseRaceSession(raw);
  if (!stored) {
    await redis.del(`race:${raceId}`);
    return { ok: false, error: 'Race session corrupt', status: 400 };
  }

  const checked = validateRaceOwnership(stored, session.username, session.challengeId);
  if (!checked.ok) return checked;

  const claimToken = newId('claim');
  await redis.set(`race:${raceId}`, JSON.stringify({ ...stored, claimToken }));

  const confirmRaw = await redis.get(`race:${raceId}`);
  if (!confirmRaw) {
    return { ok: false, error: 'Race session not found or already used', status: 400 };
  }
  const confirm = parseRaceSession(confirmRaw);
  if (!confirm || confirm.claimToken !== claimToken) {
    return { ok: false, error: 'Race session already claimed', status: 409 };
  }

  await redis.del(`race:${raceId}`);
  const openKey = `race_open:${session.username}:${session.challengeId}`;
  const openId = await redis.get(openKey);
  if (openId === raceId) {
    await redis.del(openKey);
  }

  return { ok: true, session };
}

function didLeaderboardChange(a: LeaderboardEntry[], b: LeaderboardEntry[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left?.username !== right?.username ||
      left?.bestCorrectWords !== right?.bestCorrectWords ||
      left?.bestTimeSeconds !== right?.bestTimeSeconds ||
      left?.score !== right?.score
    ) {
      return true;
    }
  }
  return false;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Challenge content is exactly what the user entered — no AI rewrite.
 * Players see and type that same text, character for character.
 */
async function createChallengeFromPrompt(prompt: string, createdBy: string): Promise<Challenge> {
  const subId = getSubredditId();
  const content = prompt;
  const domain = detectContentDomain(content);
  const lineCount = content.split('\n').length;

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

// ---- Create challenge from exact text (in-app free play) ----
app.post('/api/challenge/generate', async (req, res) => {
  try {
    const { prompt: rawPrompt } = req.body as { prompt?: string };

    if (!rawPrompt || typeof rawPrompt !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const prompt = sanitizePrompt(rawPrompt);
    if (prompt.length < 3) {
      return res.status(400).json({ error: 'Text must be at least 3 characters' });
    }

    const username = await resolveUsername();
    const allowed = await checkRateLimit(username, 'generate', 5);
    if (!allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded: max 5 challenges per hour',
      });
    }

    const challenge = await createChallengeFromPrompt(prompt, username);
    return res.json({ challenge });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create challenge';
    console.error('[API] Challenge create error:', err);
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

// ---- Start race (server clock + one-shot session token) ----
app.post('/api/race/start', async (req, res) => {
  try {
    const body = req.body as { challengeId?: string };
    const player = await resolveUsername();
    if (player === 'anonymous') {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!body.challengeId || typeof body.challengeId !== 'string') {
      return res.status(400).json({ error: 'challengeId is required' });
    }

    const allowed = await checkRateLimit(player, 'race_start', 120);
    if (!allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded: too many race starts per hour',
      });
    }

    const challenge = await getChallenge(redis, body.challengeId);
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Invalidate any previous open race for this user+challenge
    const openKey = `race_open:${player}:${body.challengeId}`;
    const prevId = await redis.get(openKey);
    if (prevId) {
      await redis.del(`race:${prevId}`);
      await redis.del(openKey);
    }

    const session = await createRaceSession(player, body.challengeId);
    console.log(`[API] Race started: ${player} race=${session.id} challenge=${body.challengeId}`);
    return res.json({
      raceId: session.id,
      startedAt: session.startedAt,
      expiresInMs: RACE_TTL_MS,
    });
  } catch (err) {
    console.error('[API] Race start error:', err);
    return res.status(500).json({ error: 'Failed to start race' });
  }
});

// ---- Submit Score ----
// Metrics are derived server-side from typed text + race start time.
// Client-claimed wpm/accuracy/time/completed are ignored when present.
app.post('/api/score/submit', async (req, res) => {
  try {
    const body = req.body as {
      challengeId?: string;
      raceId?: string;
      typed?: string;
      // Legacy client fields — ignored for scoring
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

    if (!body.challengeId || typeof body.challengeId !== 'string') {
      return res.status(400).json({ error: 'challengeId is required' });
    }
    if (typeof body.typed !== 'string') {
      return res.status(400).json({ error: 'typed content is required' });
    }

    const allowed = await checkRateLimit(player, 'submit', 60);
    if (!allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded: max 60 score submissions per hour',
      });
    }

    const challenge = await getChallenge(redis, body.challengeId);
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // 1) Load race (server clock). 2) Derive metrics. 3) Claim one-shot. 4) Persist.
    const race = await loadRaceSession(body.raceId ?? '', player, body.challengeId);
    if (!race.ok) {
      console.warn(`[Security] Race rejected for ${player}: ${race.error}`);
      return res.status(race.status).json({ error: race.error });
    }

    const timeSeconds = Math.max(1, raceElapsedSeconds(race.session.startedAt));
    const validated = validatePlayMetrics({
      typedRaw: body.typed,
      content: challenge.content,
      timeSeconds,
    });

    if (!validated.ok) {
      console.warn(`[Security] Score validation failed for ${player}: ${validated.error}`);
      return res.status(400).json({ error: validated.error });
    }

    const claimed = await claimRaceSession(race.session);
    if (!claimed.ok) {
      console.warn(`[Security] Race claim failed for ${player}: ${claimed.error}`);
      return res.status(claimed.status).json({ error: claimed.error });
    }

    const { metrics } = validated;
    const scoreValue = calculateScore(metrics.accuracy / 100, metrics.wpm, metrics.timeSeconds);

    if (metrics.wpm >= 120) {
      console.log(
        `[Monitor] High WPM: ${player} WPM=${metrics.wpm} Acc=${metrics.accuracy}% challenge=${body.challengeId}`
      );
    }

    const id = newId('sc');
    const subId = getSubredditId();

    const playerScore: PlayerScore = {
      id,
      username: player,
      challengeId: body.challengeId,
      prompt: challenge.prompt,
      domain: challenge.domain,
      wpm: metrics.wpm,
      accuracy: metrics.accuracy,
      timeSeconds: metrics.timeSeconds,
      score: scoreValue,
      completed: metrics.completed,
      playedAt: Date.now(),
      communityId: subId,
      wordsTyped: metrics.wordsTyped,
      correctWords: metrics.correctWords,
    };

    const previousEntries = await getWeeklyLeaderboard(redis, subId);
    await saveScore(redis, playerScore, {
      rankOnLeaderboard: metrics.eligibleForLeaderboard,
    });

    const weeklyRank = await getPlayerWeeklyRank(redis, subId, player);
    const allTimeRank = await getPlayerAllTimeRank(redis, subId, player);
    const entries = await enrichPlayerBadges(redis, await getWeeklyLeaderboard(redis, subId));

    // Live updates only when top-25 ranking actually changes
    const broadcastKey = `lb_weekly_last_broadcast:${subId}`;
    const lastBroadcastStr = memoryCache.get<string>(broadcastKey);
    const lastBroadcast = lastBroadcastStr
      ? (JSON.parse(lastBroadcastStr) as LeaderboardEntry[])
      : previousEntries;

    if (metrics.eligibleForLeaderboard && didLeaderboardChange(lastBroadcast, entries)) {
      memoryCache.set(broadcastKey, JSON.stringify(entries), 60000);
      await broadcastWeeklyLeaderboard(realtime, subId, entries, weekStartKey());
      console.log(`[Realtime] Broadcasted weekly leaderboard for ${subId}`);
    }

    console.log(
      `[API] Score submitted: ${player} — WPM:${metrics.wpm} Acc:${metrics.accuracy}% CorrectWords:${metrics.correctWords} Time:${metrics.timeSeconds}s Score:${scoreValue} completed=${metrics.completed} ranked=${metrics.eligibleForLeaderboard}`
    );

    return res.json({
      score: playerScore,
      weeklyRank,
      allTimeRank,
      ranked: metrics.eligibleForLeaderboard,
    });
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
          'Paste or type the exact text players will see and type. Nothing is rewritten.',
        acceptLabel: 'Post Challenge',
        cancelLabel: 'Cancel',
        fields: [
          {
            type: 'paragraph',
            name: 'prompt',
            label: 'Text to type',
            helpText:
              'This is the challenge content itself — every character is what racers type. Example: a short paragraph, a code snippet, or a brief you want the community to race.',
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

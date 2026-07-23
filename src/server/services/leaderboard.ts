import type {
  Challenge,
  LeaderboardEntry,
  PlayerScore,
  PlayerProfile,
} from '../../shared/types/index.js';
import { isBetterRun } from '../../shared/types/index.js';
import {
  monthKey,
  previousMonthKey,
  previousWeekStartKey,
  previousYearKey,
  weekStartKey,
  yearKey,
} from '../../shared/utils/time.js';
import { formatSubredditLabel } from '../../shared/utils/antiCheat.js';
import { memoryCache } from './memoryCache.js';

/** Minimal Redis surface used by Echokeys leaderboard storage. */
export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<string | void>;
  del(...keys: string[]): Promise<void | number>;
};

function runKey(entry: Pick<LeaderboardEntry, 'bestCorrectWords' | 'bestTimeSeconds' | 'score'>) {
  return {
    correctWords: entry.bestCorrectWords ?? 0,
    // Legacy rows may lack time — treat missing as "slow" so real times can win ties.
    timeSeconds: entry.bestTimeSeconds > 0 ? entry.bestTimeSeconds : Number.MAX_SAFE_INTEGER,
  };
}

/** Apply best-run fields from incoming onto existing when the run ranks higher. */
function applyBetterRun(existing: LeaderboardEntry, incoming: LeaderboardEntry): void {
  if (isBetterRun(runKey(incoming), runKey(existing))) {
    existing.bestCorrectWords = incoming.bestCorrectWords ?? 0;
    existing.bestTimeSeconds = incoming.bestTimeSeconds ?? 0;
    existing.score = incoming.score;
    existing.accuracy = incoming.accuracy;
  }
  existing.bestWpm = Math.max(existing.bestWpm, incoming.bestWpm);
  existing.lastPlayed = Math.max(existing.lastPlayed, incoming.lastPlayed);
  existing.badges = [...new Set([...existing.badges, ...incoming.badges])];
  existing.totalWordsTyped = Math.max(existing.totalWordsTyped || 0, incoming.totalWordsTyped || 0);
}

/** Period merge: sum challenge counts across archived weeks/months; keep best run. */
function mergePeriodEntry(target: LeaderboardEntry[], incoming: LeaderboardEntry): void {
  const idx = target.findIndex((e) => e.username === incoming.username);

  if (idx >= 0) {
    const existing = target[idx]!;
    applyBetterRun(existing, incoming);
    existing.challengesCompleted += incoming.challengesCompleted;
    return;
  }

  target.push({
    ...incoming,
    badges: [...incoming.badges],
    bestCorrectWords: incoming.bestCorrectWords ?? 0,
    bestTimeSeconds: incoming.bestTimeSeconds ?? 0,
  });
}

/** All-time merge: keep best run and absolute lifetime counters. */
function mergeAllTimeEntry(target: LeaderboardEntry[], incoming: LeaderboardEntry): void {
  const idx = target.findIndex((e) => e.username === incoming.username);

  if (idx >= 0) {
    const existing = target[idx]!;
    applyBetterRun(existing, incoming);
    existing.challengesCompleted = Math.max(
      existing.challengesCompleted,
      incoming.challengesCompleted
    );
    return;
  }

  target.push({
    ...incoming,
    badges: [...incoming.badges],
    bestCorrectWords: incoming.bestCorrectWords ?? 0,
    bestTimeSeconds: incoming.bestTimeSeconds ?? 0,
  });
}

/**
 * Rank: most correct words first, then lowest time.
 * Ties fall back to accuracy, then WPM.
 */
function sortAndRank(entries: LeaderboardEntry[], limit: number): LeaderboardEntry[] {
  entries.sort((a, b) => {
    const aWords = a.bestCorrectWords ?? 0;
    const bWords = b.bestCorrectWords ?? 0;
    if (bWords !== aWords) return bWords - aWords;

    const aTime = a.bestTimeSeconds > 0 ? a.bestTimeSeconds : Number.MAX_SAFE_INTEGER;
    const bTime = b.bestTimeSeconds > 0 ? b.bestTimeSeconds : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;

    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return b.bestWpm - a.bestWpm;
  });
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return entries.slice(0, limit);
}

async function readJson<T>(redis: RedisLike, key: string, fallback: T): Promise<T> {
  const raw = await redis.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(redis: RedisLike, key: string, value: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(value));
}

async function awardBadge(redis: RedisLike, username: string, badge: string): Promise<void> {
  const profile = await getPlayerProfile(redis, username);
  if (!profile) return;

  if (!profile.badges.includes(badge)) {
    profile.badges.push(badge);
    memoryCache.delete(`player:${username}`);
    await writeJson(redis, `player:${username}`, profile);
  }
}

async function pushIndex(redis: RedisLike, indexKey: string, value: string): Promise<void> {
  const list = await readJson<string[]>(redis, indexKey, []);
  if (!list.includes(value)) {
    list.unshift(value);
    if (list.length > 520) list.length = 520;
    await writeJson(redis, indexKey, list);
  }
}

async function upsertAllTimeFromProfile(
  redis: RedisLike,
  subredditId: string,
  score: PlayerScore,
  profile: PlayerProfile
): Promise<void> {
  const key = `lb:${subredditId}:alltime`;
  const allTime = await readJson<LeaderboardEntry[]>(redis, key, []);

  mergeAllTimeEntry(allTime, {
    rank: 0,
    username: score.username,
    score: score.score,
    accuracy: score.accuracy,
    bestWpm: Math.max(profile.bestWpm, score.wpm),
    challengesCompleted: profile.totalChallenges,
    lastPlayed: score.playedAt,
    badges: [...profile.badges],
    totalWordsTyped: profile.totalWordsTyped,
    bestCorrectWords: score.correctWords ?? 0,
    bestTimeSeconds: score.timeSeconds ?? 0,
  });

  await writeJson(redis, key, sortAndRank(allTime, 100));
  memoryCache.delete(key);
}

// ---- Score Storage ----

export type SaveScoreOptions = {
  /**
   * When false, the score is stored on the player history but does not update
   * weekly / all-time community leaderboards (e.g. low-progress timeouts).
   * Defaults to true for backward-compatible callers.
   */
  rankOnLeaderboard?: boolean;
};

export async function saveScore(
  redis: RedisLike,
  score: PlayerScore,
  options: SaveScoreOptions = {}
): Promise<void> {
  const rankOnLeaderboard = options.rankOnLeaderboard !== false;

  await writeJson(redis, `score:${score.id}`, score);

  const idxKey = `scores:idx:${score.username}`;
  const ids = await readJson<string[]>(redis, idxKey, []);
  ids.unshift(score.id);
  if (ids.length > 100) ids.length = 100;
  await writeJson(redis, idxKey, ids);

  const subId = score.communityId || 'global';
  const week = weekStartKey();
  memoryCache.delete(`lb:${subId}:weekly:${week}`);
  memoryCache.delete(`player:${score.username}`);

  const profile = await updatePlayerProfile(redis, score, {
    trackPersonalBest: rankOnLeaderboard,
  });
  if (rankOnLeaderboard) {
    await updateWeeklyLeaderboard(redis, score, profile);
    await upsertAllTimeFromProfile(redis, subId, score, profile);
  }
}

async function updatePlayerProfile(
  redis: RedisLike,
  score: PlayerScore,
  options: { trackPersonalBest?: boolean } = {}
): Promise<PlayerProfile> {
  const trackPersonalBest = options.trackPersonalBest !== false;
  const key = `player:${score.username}`;
  const profile: PlayerProfile = (await getPlayerProfile(redis, score.username)) ?? {
    username: score.username,
    bestWpm: 0,
    bestAccuracy: 0,
    totalChallenges: 0,
    badges: [],
    domainCounts: {},
    lastPlayed: null,
    joinedAt: Date.now(),
    totalWordsTyped: 0,
    bestCorrectWords: 0,
    bestTimeSeconds: 0,
  };

  profile.bestWpm = Math.max(profile.bestWpm, score.wpm);
  profile.bestAccuracy = Math.max(profile.bestAccuracy, score.accuracy);
  // Only full clears count as completed challenges on the profile.
  if (score.completed) {
    profile.totalChallenges += 1;
  }
  profile.lastPlayed = score.playedAt;
  profile.totalWordsTyped = (profile.totalWordsTyped || 0) + (score.wordsTyped || 0);

  // Personal best (correct words / time) only from leaderboard-eligible runs.
  if (trackPersonalBest) {
    const run = {
      correctWords: score.correctWords ?? 0,
      timeSeconds: score.timeSeconds ?? 0,
    };
    const personalBest = {
      correctWords: profile.bestCorrectWords ?? 0,
      timeSeconds: profile.bestTimeSeconds ?? 0,
    };
    if (isBetterRun(run, personalBest)) {
      profile.bestCorrectWords = run.correctWords;
      profile.bestTimeSeconds = run.timeSeconds;
    }
  }

  if (score.communityId) {
    profile.communityId = score.communityId;
  }

  if (score.domain) {
    profile.domainCounts[score.domain] = (profile.domainCounts[score.domain] ?? 0) + 1;
  }

  await writeJson(redis, key, profile);
  memoryCache.set(key, profile, 10000);
  return profile;
}

async function updateWeeklyLeaderboard(
  redis: RedisLike,
  score: PlayerScore,
  profile: PlayerProfile
): Promise<void> {
  const subId = score.communityId || 'global';
  const week = weekStartKey();
  const key = `lb:${subId}:weekly:${week}`;
  const entries = await readJson<LeaderboardEntry[]>(redis, key, []);

  const idx = entries.findIndex((e) => e.username === score.username);
  const completedDelta = score.completed ? 1 : 0;
  const correctWords = score.correctWords ?? 0;
  const timeSeconds = score.timeSeconds ?? 0;

  if (idx >= 0) {
    const existing = entries[idx]!;
    if (
      isBetterRun(
        { correctWords, timeSeconds },
        {
          correctWords: existing.bestCorrectWords ?? 0,
          timeSeconds:
            existing.bestTimeSeconds > 0 ? existing.bestTimeSeconds : Number.MAX_SAFE_INTEGER,
        }
      )
    ) {
      existing.bestCorrectWords = correctWords;
      existing.bestTimeSeconds = timeSeconds;
      existing.score = score.score;
      existing.accuracy = score.accuracy;
    }
    existing.bestWpm = Math.max(existing.bestWpm, score.wpm);
    existing.challengesCompleted += completedDelta;
    existing.lastPlayed = score.playedAt;
    existing.totalWordsTyped = profile.totalWordsTyped;
  } else {
    entries.push({
      rank: 0,
      username: score.username,
      score: score.score,
      accuracy: score.accuracy,
      bestWpm: score.wpm,
      challengesCompleted: completedDelta,
      lastPlayed: score.playedAt,
      badges: [],
      totalWordsTyped: profile.totalWordsTyped,
      bestCorrectWords: correctWords,
      bestTimeSeconds: timeSeconds,
    });
  }

  // Top 25 weekly per community
  await writeJson(redis, key, sortAndRank(entries, 25));
}

// ---- Leaderboard Reads ----

export async function getWeeklyLeaderboard(
  redis: RedisLike,
  subredditId: string,
  weekStart?: string
): Promise<LeaderboardEntry[]> {
  const key = weekStart || weekStartKey();
  const cacheKey = `lb:${subredditId}:weekly:${key}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get<LeaderboardEntry[]>(cacheKey) ?? [];
  }

  const active = await redis.get(`lb:${subredditId}:weekly:${key}`);
  if (active) {
    try {
      const parsed = JSON.parse(active) as LeaderboardEntry[];
      memoryCache.set(cacheKey, parsed, 5000);
      return parsed;
    } catch {
      return [];
    }
  }

  const archived = await redis.get(`lb:${subredditId}:weekly:archive:${key}`);
  if (!archived) return [];
  try {
    const parsed = JSON.parse(archived) as LeaderboardEntry[];
    memoryCache.set(cacheKey, parsed, 5000);
    return parsed;
  } catch {
    return [];
  }
}

export async function getMonthlyLeaderboard(
  redis: RedisLike,
  subredditId: string,
  yearMonth: string
): Promise<LeaderboardEntry[]> {
  const cacheKey = `lb:${subredditId}:monthly:${yearMonth}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get<LeaderboardEntry[]>(cacheKey) ?? [];
  }

  // Prefer archived monthly snapshot when present
  const archived = await readJson<LeaderboardEntry[]>(
    redis,
    `lb:${subredditId}:monthly:${yearMonth}`,
    []
  );

  // For the current month (or months without a snapshot), merge weekly data live
  const currentMonth = monthKey();
  if (yearMonth === currentMonth || archived.length === 0) {
    const merged: LeaderboardEntry[] = archived.map((e) => ({
      ...e,
      badges: [...e.badges],
    }));

    const [year, month] = yearMonth.split('-').map(Number);
    const archiveKeys = await readJson<string[]>(redis, `lb:${subredditId}:weekly:archives`, []);
    for (const dateStr of archiveKeys) {
      const date = new Date(`${dateStr}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) continue;
      if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month) continue;

      const weekEntries = await readJson<LeaderboardEntry[]>(
        redis,
        `lb:${subredditId}:weekly:archive:${dateStr}`,
        []
      );
      for (const entry of weekEntries) {
        mergePeriodEntry(merged, entry);
      }
    }

    // Include the active week if it belongs to this month
    const activeWeek = weekStartKey();
    const activeWeekDate = new Date(`${activeWeek}T00:00:00.000Z`);
    if (
      !Number.isNaN(activeWeekDate.getTime()) &&
      activeWeekDate.getUTCFullYear() === year &&
      activeWeekDate.getUTCMonth() + 1 === month
    ) {
      const live = await getWeeklyLeaderboard(redis, subredditId, activeWeek);
      for (const entry of live) {
        mergePeriodEntry(merged, entry);
      }
    }

    const ranked = sortAndRank(merged, 25);
    memoryCache.set(cacheKey, ranked, 10000);
    return ranked;
  }

  memoryCache.set(cacheKey, archived, 15000);
  return archived;
}

export async function getYearlyLeaderboard(
  redis: RedisLike,
  subredditId: string,
  year: string
): Promise<LeaderboardEntry[]> {
  const cacheKey = `lb:${subredditId}:yearly:${year}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get<LeaderboardEntry[]>(cacheKey) ?? [];
  }

  const archived = await readJson<LeaderboardEntry[]>(
    redis,
    `lb:${subredditId}:yearly:${year}`,
    []
  );

  const currentYear = yearKey();
  if (year === currentYear || archived.length === 0) {
    const merged: LeaderboardEntry[] = archived.map((e) => ({
      ...e,
      badges: [...e.badges],
    }));

    const monthlyKeys = await readJson<string[]>(redis, `lb:${subredditId}:monthly:index`, []);
    for (const yearMonth of monthlyKeys) {
      if (!yearMonth.startsWith(`${year}-`)) continue;
      const monthEntries = await getMonthlyLeaderboard(redis, subredditId, yearMonth);
      for (const entry of monthEntries) {
        mergePeriodEntry(merged, entry);
      }
    }

    // Always fold current month live view for the active year
    if (year === currentYear) {
      const monthEntries = await getMonthlyLeaderboard(redis, subredditId, monthKey());
      for (const entry of monthEntries) {
        mergePeriodEntry(merged, entry);
      }
    }

    const ranked = sortAndRank(merged, 50);
    memoryCache.set(cacheKey, ranked, 10000);
    return ranked;
  }

  memoryCache.set(cacheKey, archived, 15000);
  return archived;
}

export async function getAllTimeLeaderboard(
  redis: RedisLike,
  subredditId: string
): Promise<LeaderboardEntry[]> {
  const cacheKey = `lb:${subredditId}:alltime`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get<LeaderboardEntry[]>(cacheKey) ?? [];
  }

  const res = await readJson<LeaderboardEntry[]>(redis, `lb:${subredditId}:alltime`, []);
  memoryCache.set(cacheKey, res, 15000);
  return res;
}

export async function getPlayerWeeklyRank(
  redis: RedisLike,
  subredditId: string,
  username: string
): Promise<number | null> {
  const entries = await getWeeklyLeaderboard(redis, subredditId);
  const entry = entries.find((e) => e.username === username);
  return entry ? entry.rank : null;
}

export async function getPlayerAllTimeRank(
  redis: RedisLike,
  subredditId: string,
  username: string
): Promise<number | null> {
  const entries = await getAllTimeLeaderboard(redis, subredditId);
  const entry = entries.find((e) => e.username === username);
  return entry ? entry.rank : null;
}

export async function getPlayerProfile(
  redis: RedisLike,
  username: string
): Promise<PlayerProfile | null> {
  const cacheKey = `player:${username}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get<PlayerProfile | null>(cacheKey);
  }

  const profile = await readJson<PlayerProfile | null>(redis, `player:${username}`, null);
  // Never cache null — a subsequent create would be hidden by a negative hit.
  if (profile) {
    memoryCache.set(cacheKey, profile, 10000);
  }
  return profile;
}

export async function getPlayerScores(
  redis: RedisLike,
  username: string
): Promise<PlayerScore[]> {
  const ids = await readJson<string[]>(redis, `scores:idx:${username}`, []);
  const scores: PlayerScore[] = [];

  for (const id of ids.slice(0, 20)) {
    const score = await readJson<PlayerScore | null>(redis, `score:${id}`, null);
    if (score) scores.push(score);
  }

  return scores;
}

export async function enrichPlayerBadges(
  redis: RedisLike,
  entries: LeaderboardEntry[]
): Promise<LeaderboardEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const profile = await getPlayerProfile(redis, entry.username);
      return {
        ...entry,
        badges: profile?.badges ?? entry.badges,
        totalWordsTyped: profile?.totalWordsTyped ?? entry.totalWordsTyped,
      };
    })
  );
}

// ---- Snapshot Logic (scheduler) ----

export async function snapshotWeekly(
  redis: RedisLike,
  subredditId: string,
  subredditName: string,
  now = new Date()
): Promise<void> {
  const endedWeek = previousWeekStartKey(now);
  const entries = await getWeeklyLeaderboard(redis, subredditId, endedWeek);
  if (entries.length === 0) {
    console.log(
      `[Leaderboard] Weekly snapshot skipped — no entries for ${subredditId} on ${endedWeek}`
    );
    return;
  }

  await writeJson(redis, `lb:${subredditId}:weekly:archive:${endedWeek}`, entries);
  await redis.del(`lb:${subredditId}:weekly:${endedWeek}`);
  memoryCache.delete(`lb:${subredditId}:weekly:${endedWeek}`);
  await pushIndex(redis, `lb:${subredditId}:weekly:archives`, endedWeek);

  const badgeLabel = `Weekly Champion - ${formatSubredditLabel(subredditName)}`;
  for (let i = 0; i < Math.min(3, entries.length); i++) {
    await awardBadge(redis, entries[i]!.username, badgeLabel);
  }

  // Feed all-time with absolute counters from profiles when available
  for (const entry of entries) {
    const profile = await getPlayerProfile(redis, entry.username);
    if (profile) {
      await upsertAllTimeFromProfile(
        redis,
        subredditId,
        {
          id: `snap-${endedWeek}-${entry.username}`,
          username: entry.username,
          challengeId: 'snapshot',
          wpm: entry.bestWpm,
          accuracy: entry.accuracy,
          timeSeconds: entry.bestTimeSeconds ?? 0,
          score: entry.score,
          completed: true,
          playedAt: entry.lastPlayed,
          communityId: subredditId,
          wordsTyped: 0,
          correctWords: entry.bestCorrectWords ?? 0,
        },
        profile
      );
    } else {
      const allTime = await readJson<LeaderboardEntry[]>(redis, `lb:${subredditId}:alltime`, []);
      mergeAllTimeEntry(allTime, entry);
      await writeJson(redis, `lb:${subredditId}:alltime`, sortAndRank(allTime, 100));
      memoryCache.delete(`lb:${subredditId}:alltime`);
    }
  }

  console.log(
    `[Leaderboard] Weekly snapshot archived: ${subredditId} ${endedWeek} (${entries.length} entries)`
  );
}

export async function snapshotMonthly(
  redis: RedisLike,
  subredditId: string,
  subredditName: string,
  now = new Date()
): Promise<void> {
  const mk = previousMonthKey(now);
  const [year, month] = mk.split('-').map(Number);
  const merged: LeaderboardEntry[] = [];

  const archiveKeys = await readJson<string[]>(redis, `lb:${subredditId}:weekly:archives`, []);

  for (const dateStr of archiveKeys) {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) continue;
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month) continue;

    const weekEntries = await readJson<LeaderboardEntry[]>(
      redis,
      `lb:${subredditId}:weekly:archive:${dateStr}`,
      []
    );
    for (const entry of weekEntries) {
      mergePeriodEntry(merged, entry);
    }
  }

  if (merged.length === 0) {
    console.log(`[Leaderboard] Monthly snapshot skipped — no entries for ${subredditId} on ${mk}`);
    return;
  }

  const monthEntries = sortAndRank(merged, 25);
  await writeJson(redis, `lb:${subredditId}:monthly:${mk}`, monthEntries);
  memoryCache.delete(`lb:${subredditId}:monthly:${mk}`);
  await pushIndex(redis, `lb:${subredditId}:monthly:index`, mk);

  const badgeLabel = `Monthly Champion - ${formatSubredditLabel(subredditName)}`;
  for (let i = 0; i < Math.min(3, monthEntries.length); i++) {
    await awardBadge(redis, monthEntries[i]!.username, badgeLabel);
  }

  console.log(
    `[Leaderboard] Monthly snapshot saved: ${subredditId} ${mk} (${monthEntries.length} entries)`
  );
}

export async function snapshotYearly(
  redis: RedisLike,
  subredditId: string,
  subredditName: string,
  now = new Date()
): Promise<void> {
  const yk = previousYearKey(now);
  const year = Number(yk);
  const merged: LeaderboardEntry[] = [];

  const monthlyKeys = await readJson<string[]>(redis, `lb:${subredditId}:monthly:index`, []);
  for (const yearMonth of monthlyKeys) {
    if (!yearMonth.startsWith(`${year}-`)) continue;

    const monthEntries = await readJson<LeaderboardEntry[]>(
      redis,
      `lb:${subredditId}:monthly:${yearMonth}`,
      []
    );
    for (const entry of monthEntries) {
      mergePeriodEntry(merged, entry);
    }
  }

  if (merged.length === 0) {
    console.log(`[Leaderboard] Yearly snapshot skipped — no entries for ${subredditId} on ${yk}`);
    return;
  }

  const yearEntries = sortAndRank(merged, 50);
  await writeJson(redis, `lb:${subredditId}:yearly:${yk}`, yearEntries);
  memoryCache.delete(`lb:${subredditId}:yearly:${yk}`);

  const badgeLabel = `Yearly Champion - ${formatSubredditLabel(subredditName)}`;
  for (let i = 0; i < Math.min(3, yearEntries.length); i++) {
    await awardBadge(redis, yearEntries[i]!.username, badgeLabel);
  }

  console.log(
    `[Leaderboard] Yearly snapshot saved: ${subredditId} ${yk} (${yearEntries.length} entries)`
  );
}

// ---- Challenges ----

export async function saveChallenge(redis: RedisLike, challenge: Challenge): Promise<void> {
  const cacheKey = `challenge:${challenge.id}`;
  await writeJson(redis, cacheKey, challenge);
  memoryCache.set(cacheKey, challenge, 3600000);
}

export async function getChallenge(redis: RedisLike, id: string): Promise<Challenge | null> {
  const cacheKey = `challenge:${id}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get<Challenge | null>(cacheKey);
  }

  const challenge = await readJson<Challenge | null>(redis, `challenge:${id}`, null);
  // Never cache null — a later save would be hidden by a negative hit.
  if (challenge) {
    memoryCache.set(cacheKey, challenge, 3600000);
  }
  return challenge;
}

export { monthKey, weekStartKey, yearKey };

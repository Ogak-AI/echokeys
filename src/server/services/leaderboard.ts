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

/**
 * Durable leaderboard write rules:
 * - Never delete Redis leaderboard keys (callers must not redis.del lb:*).
 * - Never replace a non-empty board with an empty payload.
 * - Merge mode unions rows so partial writes cannot erase other players.
 * - Replace mode writes a full board snapshot but still refuses empty wipes.
 */
async function persistLeaderboardEntries(
  redis: RedisLike,
  key: string,
  incoming: LeaderboardEntry[],
  limit: number,
  mode: 'period' | 'alltime' | 'replace' = 'period'
): Promise<LeaderboardEntry[]> {
  const existing = await readJson<LeaderboardEntry[]>(redis, key, []);

  if (incoming.length === 0 && existing.length > 0) {
    console.warn(
      `[Leaderboard] Refusing to wipe ${key} (${existing.length} existing entries)`
    );
    return sortAndRank(
      existing.map((e) => ({ ...e, badges: [...(e.badges ?? [])] })),
      limit
    );
  }

  let merged: LeaderboardEntry[];
  if (mode === 'replace') {
    merged = incoming.map((e) => ({
      ...e,
      badges: [...(e.badges ?? [])],
    }));
    // Keep any existing players missing from this snapshot (defense in depth).
    for (const entry of existing) {
      if (!merged.some((e) => e.username === entry.username)) {
        merged.push({ ...entry, badges: [...(entry.badges ?? [])] });
      }
    }
  } else {
    merged = existing.map((e) => ({
      ...e,
      badges: [...(e.badges ?? [])],
    }));
    for (const entry of incoming) {
      if (mode === 'alltime') {
        mergeAllTimeEntry(merged, entry);
      } else {
        mergePeriodEntry(merged, entry);
      }
    }
  }

  if (merged.length === 0 && existing.length > 0) {
    console.warn(
      `[Leaderboard] Refusing to wipe ${key} (${existing.length} existing entries)`
    );
    return sortAndRank(
      existing.map((e) => ({ ...e, badges: [...(e.badges ?? [])] })),
      limit
    );
  }

  const ranked = sortAndRank(merged, limit);
  await writeJson(redis, key, ranked);
  memoryCache.delete(key);
  return ranked;
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
  await persistLeaderboardEntries(
    redis,
    key,
    [
      {
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
      },
    ],
    100,
    'alltime'
  );
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

  // Full-board replace with wipe protection — never redis.del the weekly key.
  await persistLeaderboardEntries(redis, key, entries, 25, 'replace');
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

  // Prefer live key; fall back to archive. If both exist, merge so nothing is lost.
  const active = await readJson<LeaderboardEntry[]>(
    redis,
    `lb:${subredditId}:weekly:${key}`,
    []
  );
  const archived = await readJson<LeaderboardEntry[]>(
    redis,
    `lb:${subredditId}:weekly:archive:${key}`,
    []
  );

  if (active.length === 0 && archived.length === 0) {
    return [];
  }

  const merged: LeaderboardEntry[] = [];
  for (const entry of archived) {
    mergePeriodEntry(merged, entry);
  }
  for (const entry of active) {
    mergePeriodEntry(merged, entry);
  }
  const ranked = sortAndRank(merged, 25);
  memoryCache.set(cacheKey, ranked, 5000);
  return ranked;
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

  // Copy into archive only — never delete the live weekly key.
  // Leaderboard history must survive upgrades, snapshots, and re-reads.
  // Use replace (not period-sum) so re-running the job is idempotent.
  await persistLeaderboardEntries(
    redis,
    `lb:${subredditId}:weekly:archive:${endedWeek}`,
    entries,
    25,
    'replace'
  );
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
      await persistLeaderboardEntries(
        redis,
        `lb:${subredditId}:alltime`,
        [entry],
        100,
        'alltime'
      );
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
  // Full month snapshot — replace mode keeps extra rows, refuses empty wipe.
  await persistLeaderboardEntries(
    redis,
    `lb:${subredditId}:monthly:${mk}`,
    monthEntries,
    25,
    'replace'
  );
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
  await persistLeaderboardEntries(
    redis,
    `lb:${subredditId}:yearly:${yk}`,
    yearEntries,
    50,
    'replace'
  );

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

// ---- Durable backup (survives uninstall via subreddit wiki) ----

/** Compact snapshot written outside Redis so reinstall can restore ranks. */
export type LeaderboardBackupV1 = {
  v: 1;
  subredditId: string;
  savedAt: number;
  alltime: LeaderboardEntry[];
  /** Live weekly boards keyed by week-start (YYYY-MM-DD). */
  weekly: Record<string, LeaderboardEntry[]>;
  /** Archived weekly boards. */
  weeklyArchives: Record<string, LeaderboardEntry[]>;
  weeklyArchiveIndex: string[];
  monthly: Record<string, LeaderboardEntry[]>;
  monthlyIndex: string[];
  yearly: Record<string, LeaderboardEntry[]>;
  profiles: PlayerProfile[];
};

const BACKUP_WEEK_CAP = 16;
const BACKUP_MONTH_CAP = 24;
const BACKUP_YEAR_CAP = 5;

function collectUsernames(boards: LeaderboardEntry[][]): Set<string> {
  const names = new Set<string>();
  for (const board of boards) {
    for (const entry of board) {
      if (entry.username) names.add(entry.username);
    }
  }
  return names;
}

/** Build a full leaderboard backup from Redis for wiki persistence. */
export async function exportLeaderboardBackup(
  redis: RedisLike,
  subredditId: string,
  now = new Date()
): Promise<LeaderboardBackupV1> {
  const alltime = await getAllTimeLeaderboard(redis, subredditId);
  const currentWeek = weekStartKey(now);
  const weeklyArchiveIndex = (
    await readJson<string[]>(redis, `lb:${subredditId}:weekly:archives`, [])
  ).slice(0, BACKUP_WEEK_CAP);
  const monthlyIndex = (
    await readJson<string[]>(redis, `lb:${subredditId}:monthly:index`, [])
  ).slice(0, BACKUP_MONTH_CAP);

  const weekly: Record<string, LeaderboardEntry[]> = {};
  const currentWeekly = await getWeeklyLeaderboard(redis, subredditId, currentWeek);
  if (currentWeekly.length > 0) weekly[currentWeek] = currentWeekly;

  // Also keep a few prior live week keys if still present (no delete policy).
  for (let i = 1; i <= 4; i++) {
    const wk = weekStartWithOffsetLocal(-i, now);
    if (weekly[wk]) continue;
    const rows = await readJson<LeaderboardEntry[]>(redis, `lb:${subredditId}:weekly:${wk}`, []);
    if (rows.length > 0) weekly[wk] = sortAndRank(rows, 25);
  }

  const weeklyArchives: Record<string, LeaderboardEntry[]> = {};
  for (const wk of weeklyArchiveIndex) {
    const rows = await readJson<LeaderboardEntry[]>(
      redis,
      `lb:${subredditId}:weekly:archive:${wk}`,
      []
    );
    if (rows.length > 0) weeklyArchives[wk] = sortAndRank(rows, 25);
  }

  const monthly: Record<string, LeaderboardEntry[]> = {};
  for (const mk of monthlyIndex) {
    const rows = await getMonthlyLeaderboard(redis, subredditId, mk);
    if (rows.length > 0) monthly[mk] = rows;
  }

  const yearly: Record<string, LeaderboardEntry[]> = {};
  const years = new Set<string>([yearKey(now)]);
  for (let i = 1; i < BACKUP_YEAR_CAP; i++) {
    years.add(String(Number(yearKey(now)) - i));
  }
  for (const y of years) {
    const rows = await getYearlyLeaderboard(redis, subredditId, y);
    if (rows.length > 0) yearly[y] = rows;
  }

  const names = collectUsernames([
    alltime,
    ...Object.values(weekly),
    ...Object.values(weeklyArchives),
    ...Object.values(monthly),
    ...Object.values(yearly),
  ]);

  const profiles: PlayerProfile[] = [];
  for (const username of names) {
    const profile = await getPlayerProfile(redis, username);
    if (profile) profiles.push(profile);
  }

  return {
    v: 1,
    subredditId,
    savedAt: Date.now(),
    alltime,
    weekly,
    weeklyArchives,
    weeklyArchiveIndex,
    monthly,
    monthlyIndex,
    yearly,
    profiles,
  };
}

/** True when backup holds any rank/profile data worth restoring. */
export function backupHasData(backup: LeaderboardBackupV1 | null | undefined): boolean {
  if (!backup || backup.v !== 1) return false;
  if (backup.alltime?.length) return true;
  if (backup.profiles?.length) return true;
  if (backup.weekly && Object.values(backup.weekly).some((b) => b.length > 0)) return true;
  if (backup.weeklyArchives && Object.values(backup.weeklyArchives).some((b) => b.length > 0)) {
    return true;
  }
  if (backup.monthly && Object.values(backup.monthly).some((b) => b.length > 0)) return true;
  if (backup.yearly && Object.values(backup.yearly).some((b) => b.length > 0)) return true;
  return false;
}

/**
 * Merge a backup into Redis. Never wipes existing rows — only unions / best-run merges.
 * Used after reinstall when platform Redis was cleared.
 */
export async function importLeaderboardBackup(
  redis: RedisLike,
  backup: LeaderboardBackupV1
): Promise<{ imported: boolean; players: number }> {
  if (!backupHasData(backup)) {
    return { imported: false, players: 0 };
  }

  if (backup.alltime?.length) {
    await persistLeaderboardEntries(
      redis,
      `lb:${backup.subredditId}:alltime`,
      backup.alltime,
      100,
      'alltime'
    );
  }

  for (const [wk, rows] of Object.entries(backup.weekly ?? {})) {
    if (!rows.length) continue;
    await persistLeaderboardEntries(
      redis,
      `lb:${backup.subredditId}:weekly:${wk}`,
      rows,
      25,
      'alltime'
    );
  }

  for (const [wk, rows] of Object.entries(backup.weeklyArchives ?? {})) {
    if (!rows.length) continue;
    await persistLeaderboardEntries(
      redis,
      `lb:${backup.subredditId}:weekly:archive:${wk}`,
      rows,
      25,
      'alltime'
    );
  }

  for (const wk of backup.weeklyArchiveIndex ?? []) {
    await pushIndex(redis, `lb:${backup.subredditId}:weekly:archives`, wk);
  }

  for (const [mk, rows] of Object.entries(backup.monthly ?? {})) {
    if (!rows.length) continue;
    await persistLeaderboardEntries(
      redis,
      `lb:${backup.subredditId}:monthly:${mk}`,
      rows,
      25,
      'alltime'
    );
  }

  for (const mk of backup.monthlyIndex ?? []) {
    await pushIndex(redis, `lb:${backup.subredditId}:monthly:index`, mk);
  }

  for (const [yk, rows] of Object.entries(backup.yearly ?? {})) {
    if (!rows.length) continue;
    await persistLeaderboardEntries(
      redis,
      `lb:${backup.subredditId}:yearly:${yk}`,
      rows,
      50,
      'alltime'
    );
  }

  for (const profile of backup.profiles ?? []) {
    if (!profile?.username) continue;
    const key = `player:${profile.username}`;
    const existing = await getPlayerProfile(redis, profile.username);
    if (!existing) {
      await writeJson(redis, key, profile);
      memoryCache.delete(key);
      continue;
    }

    const existingBest = {
      correctWords: existing.bestCorrectWords ?? 0,
      timeSeconds: existing.bestTimeSeconds ?? 0,
    };
    const incomingBest = {
      correctWords: profile.bestCorrectWords ?? 0,
      timeSeconds: profile.bestTimeSeconds ?? 0,
    };
    const takeIncomingBest = isBetterRun(incomingBest, existingBest);

    const merged: PlayerProfile = {
      ...existing,
      bestWpm: Math.max(existing.bestWpm, profile.bestWpm),
      bestAccuracy: Math.max(existing.bestAccuracy, profile.bestAccuracy),
      totalChallenges: Math.max(existing.totalChallenges, profile.totalChallenges),
      totalWordsTyped: Math.max(existing.totalWordsTyped || 0, profile.totalWordsTyped || 0),
      badges: [...new Set([...(existing.badges ?? []), ...(profile.badges ?? [])])],
      domainCounts: { ...existing.domainCounts },
      lastPlayed:
        Math.max(existing.lastPlayed ?? 0, profile.lastPlayed ?? 0) || existing.lastPlayed,
      joinedAt: Math.min(existing.joinedAt || Date.now(), profile.joinedAt || Date.now()),
      communityId: existing.communityId || profile.communityId,
      bestCorrectWords: takeIncomingBest
        ? incomingBest.correctWords
        : existingBest.correctWords,
      bestTimeSeconds: takeIncomingBest
        ? incomingBest.timeSeconds
        : existingBest.timeSeconds,
    };
    for (const [domain, count] of Object.entries(profile.domainCounts ?? {})) {
      const d = domain as keyof PlayerProfile['domainCounts'];
      merged.domainCounts[d] = Math.max(merged.domainCounts[d] ?? 0, count ?? 0);
    }
    await writeJson(redis, key, merged);
    memoryCache.delete(key);
  }

  return { imported: true, players: backup.profiles?.length ?? backup.alltime?.length ?? 0 };
}

/** Local week offset helper (avoids circular import from shared time in older call sites). */
function weekStartWithOffsetLocal(offset: number, date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + offset * 7);
  return d.toISOString().split('T')[0]!;
}

export { monthKey, weekStartKey, yearKey };

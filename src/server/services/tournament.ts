/**
 * Community tournaments: shared race text, join list, best-run standings.
 * Stored in Redis; never deletes standings keys (same durability rules as leaderboards).
 */
import type {
  LeaderboardEntry,
  PlayerScore,
  Tournament,
  TournamentStatus,
  TournamentSummary,
} from '../../shared/types/index.js';
import { isBetterRun } from '../../shared/types/index.js';
import type { RedisLike } from './leaderboard.js';
import { memoryCache } from './memoryCache.js';

export const DEFAULT_TOURNAMENT_DURATION_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_PLAYERS = 50;
export const MAX_TOURNAMENT_NAME = 80;
export const MAX_OPEN_LIST = 25;

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

function tournamentKey(id: string): string {
  return `tournament:${id}`;
}

function standingsKey(id: string): string {
  return `tournament:${id}:standings`;
}

function communityIndexKey(communityId: string): string {
  return `tournaments:idx:${communityId}`;
}

function sortStandings(entries: LeaderboardEntry[]): LeaderboardEntry[] {
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
  return entries;
}

function deriveStatus(t: Tournament, now = Date.now()): TournamentStatus {
  if (t.status === 'closed') return 'closed';
  if (now >= t.endsAt) return 'closed';
  return 'open';
}

function toSummary(t: Tournament): TournamentSummary {
  return {
    id: t.id,
    name: t.name,
    createdBy: t.createdBy,
    endsAt: t.endsAt,
    status: t.status,
    participantCount: t.participants.length,
    maxPlayers: t.maxPlayers,
    postId: t.postId,
    prompt: t.prompt,
  };
}

export function sanitizeTournamentName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TOURNAMENT_NAME);
  return cleaned || fallback.slice(0, MAX_TOURNAMENT_NAME);
}

export async function saveTournament(redis: RedisLike, tournament: Tournament): Promise<void> {
  const key = tournamentKey(tournament.id);
  await writeJson(redis, key, tournament);
  memoryCache.delete(key);
  memoryCache.delete(communityIndexKey(tournament.communityId));
}

export async function getTournament(
  redis: RedisLike,
  id: string,
  now = Date.now()
): Promise<Tournament | null> {
  const key = tournamentKey(id);
  if (memoryCache.has(key)) {
    const cached = memoryCache.get<Tournament>(key);
    if (cached) {
      const status = deriveStatus(cached, now);
      if (status !== cached.status) {
        cached.status = status;
        await saveTournament(redis, cached);
      }
      return cached;
    }
  }

  const tournament = await readJson<Tournament | null>(redis, key, null);
  if (!tournament) return null;

  const status = deriveStatus(tournament, now);
  if (status !== tournament.status) {
    tournament.status = status;
    await saveTournament(redis, tournament);
  } else {
    memoryCache.set(key, tournament, 10000);
  }
  return tournament;
}

async function pushCommunityIndex(
  redis: RedisLike,
  communityId: string,
  tournamentId: string
): Promise<void> {
  const key = communityIndexKey(communityId);
  const list = await readJson<string[]>(redis, key, []);
  if (!list.includes(tournamentId)) {
    list.unshift(tournamentId);
    // Cap the community index to avoid unbounded growth and slow list reads.
    if (list.length > MAX_OPEN_LIST * 4) list.length = MAX_OPEN_LIST * 4;
    await writeJson(redis, key, list);
  }
  memoryCache.delete(key);
}

export type CreateTournamentInput = {
  id: string;
  name: string;
  communityId: string;
  createdBy: string;
  challengeId: string;
  durationMs?: number;
  maxPlayers?: number;
  prompt?: string;
  domain?: Tournament['domain'];
  now?: number;
};

export async function createTournament(
  redis: RedisLike,
  input: CreateTournamentInput
): Promise<Tournament> {
  const now = input.now ?? Date.now();
  const createdBy = input.createdBy.toLowerCase();
  const duration = Math.max(
    60 * 60 * 1000,
    Math.min(input.durationMs ?? DEFAULT_TOURNAMENT_DURATION_MS, 14 * 24 * 60 * 60 * 1000)
  );
  const maxPlayers = Math.max(
    2,
    Math.min(input.maxPlayers ?? DEFAULT_MAX_PLAYERS, 200)
  );
  const name = sanitizeTournamentName(
    input.name,
    `Tournament by ${createdBy}`
  );

  const tournament: Tournament = {
    id: input.id,
    name,
    communityId: input.communityId,
    createdBy,
    createdAt: now,
    endsAt: now + duration,
    challengeId: input.challengeId,
    maxPlayers,
    participants: [createdBy],
    status: 'open',
    prompt: input.prompt,
    domain: input.domain,
  };

  await saveTournament(redis, tournament);
  await pushCommunityIndex(redis, input.communityId, tournament.id);
  await writeJson(redis, standingsKey(tournament.id), []);
  return tournament;
}

export type JoinResult =
  | { ok: true; tournament: Tournament; alreadyJoined: boolean }
  | { ok: false; error: string };

export async function joinTournament(
  redis: RedisLike,
  tournamentId: string,
  username: string,
  now = Date.now()
): Promise<JoinResult> {
  const player = username.toLowerCase();
  if (!player || player === 'anonymous') {
    return { ok: false, error: 'Authentication required' };
  }

  const tournament = await getTournament(redis, tournamentId, now);
  if (!tournament) return { ok: false, error: 'Tournament not found' };

  if (deriveStatus(tournament, now) === 'closed') {
    return { ok: false, error: 'Tournament has ended' };
  }

  if (tournament.participants.includes(player)) {
    return { ok: true, tournament, alreadyJoined: true };
  }

  if (tournament.participants.length >= tournament.maxPlayers) {
    return { ok: false, error: 'Tournament is full' };
  }

  tournament.participants.push(player);
  await saveTournament(redis, tournament);
  return { ok: true, tournament, alreadyJoined: false };
}

export async function listCommunityTournaments(
  redis: RedisLike,
  communityId: string,
  now = Date.now()
): Promise<TournamentSummary[]> {
  const ids = await readJson<string[]>(redis, communityIndexKey(communityId), []);
  const summaries: TournamentSummary[] = [];

  for (const id of ids) {
    const t = await getTournament(redis, id, now);
    if (!t) continue;
    summaries.push(toSummary(t));
    if (summaries.length >= MAX_OPEN_LIST) break;
  }

  // Open first, then soonest end, then newest
  summaries.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    if (a.endsAt !== b.endsAt) return a.endsAt - b.endsAt;
    return 0;
  });

  return summaries;
}

export async function getTournamentStandings(
  redis: RedisLike,
  tournamentId: string
): Promise<LeaderboardEntry[]> {
  const key = standingsKey(tournamentId);
  if (memoryCache.has(key)) {
    return memoryCache.get<LeaderboardEntry[]>(key) ?? [];
  }
  const entries = await readJson<LeaderboardEntry[]>(redis, key, []);
  const ranked = sortStandings(
    entries.map((e) => ({ ...e, badges: [...(e.badges ?? [])] }))
  );
  memoryCache.set(key, ranked, 5000);
  return ranked;
}

export type RecordTournamentScoreResult =
  | { ok: true; standings: LeaderboardEntry[]; rank: number | null }
  | { ok: false; error: string };

/**
 * Update tournament standings with a player's best run.
 * Caller must already validate race metrics; this only checks membership + window.
 */
export async function recordTournamentScore(
  redis: RedisLike,
  tournamentId: string,
  score: PlayerScore,
  now = Date.now()
): Promise<RecordTournamentScoreResult> {
  const tournament = await getTournament(redis, tournamentId, now);
  if (!tournament) return { ok: false, error: 'Tournament not found' };

  if (tournament.challengeId !== score.challengeId) {
    return { ok: false, error: 'Score does not match tournament challenge' };
  }

  const player = score.username.toLowerCase();
  if (!tournament.participants.includes(player)) {
    return { ok: false, error: 'Join the tournament before racing' };
  }

  if (deriveStatus(tournament, now) === 'closed') {
    return { ok: false, error: 'Tournament has ended' };
  }

  const key = standingsKey(tournamentId);
  const entries = await readJson<LeaderboardEntry[]>(redis, key, []);
  const idx = entries.findIndex((e) => e.username === player);
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
    existing.challengesCompleted += score.completed ? 1 : 0;
    existing.lastPlayed = score.playedAt;
    existing.totalWordsTyped = (existing.totalWordsTyped || 0) + (score.wordsTyped || 0);
  } else {
    entries.push({
      rank: 0,
      username: player,
      score: score.score,
      accuracy: score.accuracy,
      bestWpm: score.wpm,
      challengesCompleted: score.completed ? 1 : 0,
      lastPlayed: score.playedAt,
      badges: [],
      totalWordsTyped: score.wordsTyped || 0,
      bestCorrectWords: correctWords,
      bestTimeSeconds: timeSeconds,
    });
  }

  const ranked = sortStandings(entries).slice(0, 100);
  // Never wipe non-empty with empty
  if (ranked.length === 0 && entries.length > 0) {
    return { ok: false, error: 'Failed to update standings' };
  }
  await writeJson(redis, key, ranked);
  memoryCache.delete(key);

  const self = ranked.find((e) => e.username === player);
  return { ok: true, standings: ranked, rank: self?.rank ?? null };
}

export function isParticipant(tournament: Tournament, username: string): boolean {
  return tournament.participants.includes(username.toLowerCase());
}

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTournament,
  joinTournament,
  recordTournamentScore,
  getTournamentStandings,
  listCommunityTournaments,
  sanitizeTournamentName,
  DEFAULT_TOURNAMENT_DURATION_MS,
  DEFAULT_MAX_PLAYERS,
  MAX_TOURNAMENT_NAME,
} from '../src/server/services/tournament.js';
import type { PlayerScore } from '../src/shared/types/index.js';
import { memoryCache } from '../src/server/services/memoryCache.js';
import { createRedisMock } from './helpers/redisMock.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type RedisMock = ReturnType<typeof createRedisMock>;

function makeScore(
  partial: Partial<PlayerScore> & Pick<PlayerScore, 'id' | 'username' | 'communityId' | 'challengeId'>
): PlayerScore {
  return {
    wpm: 80,
    accuracy: 95,
    timeSeconds: 60,
    score: 174,
    completed: true,
    playedAt: Date.now(),
    wordsTyped: 80,
    correctWords: 76,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// createTournament
// ---------------------------------------------------------------------------
describe('joinTournament capacity', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('rejects joins once maxPlayers is reached', async () => {
    await createTournament(redis, {
      id: 'trn-cap',
      name: 'Tiny',
      communityId: 'sub-a',
      createdBy: 'host',
      challengeId: 'ch-1',
      maxPlayers: 2,
    });
    const second = await joinTournament(redis, 'trn-cap', 'alice');
    expect(second.ok).toBe(true);
    const third = await joinTournament(redis, 'trn-cap', 'bob');
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toMatch(/full/i);
  });

  it('treats non-finite maxPlayers as default capacity (not NaN-unlimited)', async () => {
    const t = await createTournament(redis, {
      id: 'trn-nan',
      name: 'NaN Max',
      communityId: 'sub-a',
      createdBy: 'host',
      challengeId: 'ch-1',
      maxPlayers: Number.NaN,
    });
    expect(Number.isFinite(t.maxPlayers)).toBe(true);
    expect(t.maxPlayers).toBe(DEFAULT_MAX_PLAYERS);
  });
});

describe('createTournament', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('sanitizes the name (strips controls, trims, collapses spaces)', async () => {
    const t = await createTournament(redis, {
      id: 'trn-name',
      name: '  Hello\u0000  World  ',
      communityId: 'sub-a',
      createdBy: 'host',
      challengeId: 'ch-1',
    });
    expect(t.name).toBe('Hello World');
  });

  it('clamps durationMs to at least 1 hour', async () => {
    const now = Date.now();
    const t = await createTournament(redis, {
      id: 'trn-short',
      name: 'Short',
      communityId: 'sub-a',
      createdBy: 'host',
      challengeId: 'ch-1',
      durationMs: 1000, // 1 second — should clamp to 1h
      now,
    });
    const minEnd = now + 60 * 60 * 1000;
    expect(t.endsAt).toBeGreaterThanOrEqual(minEnd);
  });

  it('clamps durationMs to at most 14 days', async () => {
    const now = Date.now();
    const t = await createTournament(redis, {
      id: 'trn-long',
      name: 'Long',
      communityId: 'sub-a',
      createdBy: 'host',
      challengeId: 'ch-1',
      durationMs: 999 * 24 * 60 * 60 * 1000,
      now,
    });
    const maxEnd = now + 14 * 24 * 60 * 60 * 1000 + 1000;
    expect(t.endsAt).toBeLessThanOrEqual(maxEnd);
  });

  it('auto-joins the creator as first participant (lowercased)', async () => {
    const t = await createTournament(redis, {
      id: 'trn-creator',
      name: 'Creator Test',
      communityId: 'sub-a',
      createdBy: 'HOST',
      challengeId: 'ch-1',
    });
    expect(t.participants).toContain('host');
    expect(t.participants).toHaveLength(1);
  });

  it('starts with status "open"', async () => {
    const t = await createTournament(redis, {
      id: 'trn-open',
      name: 'Open Test',
      communityId: 'sub-a',
      createdBy: 'host',
      challengeId: 'ch-1',
    });
    expect(t.status).toBe('open');
  });

  it('uses DEFAULT_MAX_PLAYERS when maxPlayers is not specified', async () => {
    const t = await createTournament(redis, {
      id: 'trn-default',
      name: 'Default',
      communityId: 'sub-a',
      createdBy: 'host',
      challengeId: 'ch-1',
    });
    expect(t.maxPlayers).toBe(DEFAULT_MAX_PLAYERS);
  });

  it('uses DEFAULT_TOURNAMENT_DURATION_MS when durationMs is not specified', async () => {
    const now = Date.now();
    const t = await createTournament(redis, {
      id: 'trn-def-dur',
      name: 'Default Dur',
      communityId: 'sub-a',
      createdBy: 'host',
      challengeId: 'ch-1',
      now,
    });
    expect(t.endsAt).toBeCloseTo(now + DEFAULT_TOURNAMENT_DURATION_MS, -2);
  });
});

// ---------------------------------------------------------------------------
// joinTournament
// ---------------------------------------------------------------------------
describe('joinTournament', () => {
  let redis: RedisMock;
  const NOW = Date.now();

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('successfully joins an open tournament', async () => {
    await createTournament(redis, {
      id: 'trn-j1',
      name: 'Join Test',
      communityId: 'sub-j',
      createdBy: 'host',
      challengeId: 'ch-1',
      now: NOW,
    });

    const result = await joinTournament(redis, 'trn-j1', 'alice', NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyJoined).toBe(false);
      expect(result.tournament.participants).toContain('alice');
    }
  });

  it('is idempotent — already joined returns ok=true with alreadyJoined=true', async () => {
    await createTournament(redis, {
      id: 'trn-j2',
      name: 'Idempotent',
      communityId: 'sub-j',
      createdBy: 'host',
      challengeId: 'ch-1',
      now: NOW,
    });
    await joinTournament(redis, 'trn-j2', 'alice', NOW);
    const again = await joinTournament(redis, 'trn-j2', 'alice', NOW);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.alreadyJoined).toBe(true);
  });

  it('rejects when tournament is full', async () => {
    await createTournament(redis, {
      id: 'trn-full',
      name: 'Full',
      communityId: 'sub-j',
      createdBy: 'a',
      challengeId: 'ch-1',
      maxPlayers: 2,
      now: NOW,
    });
    await joinTournament(redis, 'trn-full', 'b', NOW);
    const result = await joinTournament(redis, 'trn-full', 'c', NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/full/i);
  });

  it('rejects when tournament is closed (past endsAt)', async () => {
    const pastNow = NOW - 2 * 60 * 60 * 1000;
    await createTournament(redis, {
      id: 'trn-ended',
      name: 'Ended',
      communityId: 'sub-j',
      createdBy: 'a',
      challengeId: 'ch-1',
      durationMs: 60 * 60 * 1000,
      now: pastNow,
    });
    const result = await joinTournament(redis, 'trn-ended', 'z', NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ended|closed/i);
  });

  it('rejects anonymous users', async () => {
    await createTournament(redis, {
      id: 'trn-anon',
      name: 'Anon Test',
      communityId: 'sub-j',
      createdBy: 'host',
      challengeId: 'ch-1',
      now: NOW,
    });
    const result = await joinTournament(redis, 'trn-anon', 'anonymous', NOW);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordTournamentScore
// ---------------------------------------------------------------------------
describe('recordTournamentScore', () => {
  let redis: RedisMock;
  const NOW = Date.now();

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('updates best run when new score is better (more correct words)', async () => {
    await createTournament(redis, { id: 'trn-s1', name: 'S1', communityId: 'sub-s', createdBy: 'host', challengeId: 'ch-s', now: NOW });
    await joinTournament(redis, 'trn-s1', 'racer', NOW);

    await recordTournamentScore(redis, 'trn-s1', makeScore({ id: 'a', username: 'racer', communityId: 'sub-s', challengeId: 'ch-s', correctWords: 50, timeSeconds: 40 }), NOW);
    await recordTournamentScore(redis, 'trn-s1', makeScore({ id: 'b', username: 'racer', communityId: 'sub-s', challengeId: 'ch-s', correctWords: 80, timeSeconds: 55 }), NOW);

    const standings = await getTournamentStandings(redis, 'trn-s1');
    expect(standings[0]!.bestCorrectWords).toBe(80);
  });

  it('does not replace best run with a worse one', async () => {
    await createTournament(redis, { id: 'trn-s2', name: 'S2', communityId: 'sub-s', createdBy: 'host', challengeId: 'ch-s', now: NOW });
    await joinTournament(redis, 'trn-s2', 'racer', NOW);

    await recordTournamentScore(redis, 'trn-s2', makeScore({ id: 'a', username: 'racer', communityId: 'sub-s', challengeId: 'ch-s', correctWords: 80, timeSeconds: 55 }), NOW);
    await recordTournamentScore(redis, 'trn-s2', makeScore({ id: 'b', username: 'racer', communityId: 'sub-s', challengeId: 'ch-s', correctWords: 60, timeSeconds: 30 }), NOW);

    const standings = await getTournamentStandings(redis, 'trn-s2');
    expect(standings[0]!.bestCorrectWords).toBe(80);
  });

  it('ignores scores from non-members', async () => {
    await createTournament(redis, { id: 'trn-s3', name: 'S3', communityId: 'sub-s', createdBy: 'host', challengeId: 'ch-s', now: NOW });

    const result = await recordTournamentScore(
      redis,
      'trn-s3',
      makeScore({ id: 'x', username: 'outsider', communityId: 'sub-s', challengeId: 'ch-s', correctWords: 999 }),
      NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/join|member/i);
  });

  it('rejects scores after tournament closes', async () => {
    const pastNow = NOW - 2 * 60 * 60 * 1000;
    await createTournament(redis, {
      id: 'trn-s4', name: 'S4', communityId: 'sub-s', createdBy: 'host',
      challengeId: 'ch-s', durationMs: 60 * 60 * 1000, now: pastNow,
    });
    // host was added as participant at creation time
    const result = await recordTournamentScore(
      redis,
      'trn-s4',
      makeScore({ id: 'y', username: 'host', communityId: 'sub-s', challengeId: 'ch-s', correctWords: 50 }),
      NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ended|closed/i);
  });
});

// ---------------------------------------------------------------------------
// getTournamentStandings
// ---------------------------------------------------------------------------
describe('getTournamentStandings', () => {
  let redis: RedisMock;
  const NOW = Date.now();

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('returns standings sorted by correct words desc, then time asc', async () => {
    await createTournament(redis, { id: 'trn-stand', name: 'Stand', communityId: 'sub-st', createdBy: 'host', challengeId: 'ch-st', now: NOW });
    for (const u of ['p1', 'p2', 'p3']) {
      await joinTournament(redis, 'trn-stand', u, NOW);
    }

    await recordTournamentScore(redis, 'trn-stand', makeScore({ id: 'a', username: 'p1', communityId: 'sub-st', challengeId: 'ch-st', correctWords: 100, timeSeconds: 60 }), NOW);
    await recordTournamentScore(redis, 'trn-stand', makeScore({ id: 'b', username: 'p2', communityId: 'sub-st', challengeId: 'ch-st', correctWords: 100, timeSeconds: 45 }), NOW);
    await recordTournamentScore(redis, 'trn-stand', makeScore({ id: 'c', username: 'p3', communityId: 'sub-st', challengeId: 'ch-st', correctWords: 80, timeSeconds: 30 }), NOW);

    const standings = await getTournamentStandings(redis, 'trn-stand');
    expect(standings[0]!.username).toBe('p2'); // 100 words, 45s
    expect(standings[1]!.username).toBe('p1'); // 100 words, 60s
    expect(standings[2]!.username).toBe('p3'); // 80 words, 30s
  });

  it('assigns rank starting from 1', async () => {
    await createTournament(redis, { id: 'trn-rank', name: 'Rank', communityId: 'sub-rk', createdBy: 'host', challengeId: 'ch-rk', now: NOW });
    await joinTournament(redis, 'trn-rank', 'only', NOW);
    await recordTournamentScore(redis, 'trn-rank', makeScore({ id: 'r1', username: 'only', communityId: 'sub-rk', challengeId: 'ch-rk', correctWords: 50 }), NOW);

    const standings = await getTournamentStandings(redis, 'trn-rank');
    expect(standings[0]!.rank).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deriveStatus
// ---------------------------------------------------------------------------
describe('deriveStatus (via joinTournament / recordTournamentScore)', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('tournament is open before endsAt', async () => {
    const now = Date.now();
    const t = await createTournament(redis, {
      id: 'trn-open-d',
      name: 'Open',
      communityId: 'sub-d',
      createdBy: 'host',
      challengeId: 'ch-1',
      durationMs: 2 * 60 * 60 * 1000,
      now,
    });
    expect(t.status).toBe('open');
    // Joining before endsAt succeeds
    const result = await joinTournament(redis, 'trn-open-d', 'alice', now + 1000);
    expect(result.ok).toBe(true);
  });

  it('tournament is closed after endsAt', async () => {
    const now = Date.now();
    await createTournament(redis, {
      id: 'trn-closed-d',
      name: 'Closed',
      communityId: 'sub-d',
      createdBy: 'host',
      challengeId: 'ch-1',
      durationMs: 60 * 60 * 1000,
      now: now - 2 * 60 * 60 * 1000, // created 2h ago, ends in the past
    });
    const result = await joinTournament(redis, 'trn-closed-d', 'alice', now);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeTournamentName
// ---------------------------------------------------------------------------
describe('sanitizeTournamentName', () => {
  it('trims and collapses internal whitespace', () => {
    expect(sanitizeTournamentName('  Hello   World  ', 'x')).toBe('Hello World');
  });

  it('falls back to provided fallback when cleaned name is empty', () => {
    const result = sanitizeTournamentName('\u0000\u001f', 'Fallback');
    expect(result).toMatch(/^Fallback/);
  });

  it('caps at MAX_TOURNAMENT_NAME (80 chars)', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeTournamentName(long, 'x').length).toBeLessThanOrEqual(MAX_TOURNAMENT_NAME);
  });

  it('strips control characters', () => {
    expect(sanitizeTournamentName('abc\u0000def', 'x')).toBe('abcdef');
  });

  it('fallback is also capped at MAX_TOURNAMENT_NAME', () => {
    const result = sanitizeTournamentName('', 'b'.repeat(200));
    expect(result.length).toBeLessThanOrEqual(MAX_TOURNAMENT_NAME);
  });
});

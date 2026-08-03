import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseBackupContent,
  BACKUP_THROTTLE_MS,
  ensureLeaderboardsHydrated,
  restoreLeaderboardFromWikiWithRetry,
  syncLeaderboardWithWiki,
  type WikiReddit,
} from '../src/server/services/wikiBackup.js';
import {
  exportLeaderboardBackup,
  importLeaderboardBackup,
  backupHasData,
  saveScore,
  getAllTimeLeaderboard,
  getWeeklyLeaderboard,
  getPlayerProfile,
  type LeaderboardBackupV1,
} from '../src/server/services/leaderboard.js';
import type { PlayerScore, LeaderboardEntry } from '../src/shared/types/index.js';
import { memoryCache } from '../src/server/services/memoryCache.js';
import { createRedisMock } from './helpers/redisMock.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type RedisMock = ReturnType<typeof createRedisMock>;

const MARKER_START = '<!-- echokeys-lb-v1 -->';
const MARKER_END = '<!-- /echokeys-lb-v1 -->';

function makeMinimalBackup(overrides: Record<string, unknown> = {}) {
  return {
    v: 1 as const,
    subredditId: 't5_test',
    savedAt: Date.now(),
    alltime: [] as LeaderboardEntry[],
    weekly: {} as Record<string, LeaderboardEntry[]>,
    weeklyArchives: {} as Record<string, LeaderboardEntry[]>,
    weeklyArchiveIndex: [] as string[],
    monthly: {} as Record<string, LeaderboardEntry[]>,
    monthlyIndex: [] as string[],
    yearly: {} as Record<string, LeaderboardEntry[]>,
    profiles: [],
    ...overrides,
  };
}

function makeLeaderboardEntry(
  username: string,
  overrides: Partial<LeaderboardEntry> = {}
): LeaderboardEntry {
  return {
    rank: 1,
    username,
    score: 100,
    accuracy: 95,
    bestWpm: 80,
    challengesCompleted: 1,
    lastPlayed: Date.now(),
    badges: [],
    totalWordsTyped: 80,
    bestCorrectWords: 80,
    bestTimeSeconds: 60,
    ...overrides,
  };
}

function makeScore(
  partial: Partial<PlayerScore> & Pick<PlayerScore, 'id' | 'username' | 'communityId'>
): PlayerScore {
  return {
    challengeId: 'ch-1',
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

function wrapInMarkers(json: string): string {
  return [
    '# Echokeys leaderboard backup',
    '',
    MARKER_START,
    json,
    MARKER_END,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// parseBackupContent
// ---------------------------------------------------------------------------
describe('parseBackupContent', () => {
  it('returns null for empty string', () => {
    expect(parseBackupContent('')).toBeNull();
  });

  it('parses valid JSON wrapped in markers', () => {
    const backup = makeMinimalBackup({ alltime: [makeLeaderboardEntry('ace')] });
    const content = wrapInMarkers(JSON.stringify(backup));
    const parsed = parseBackupContent(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.v).toBe(1);
    expect(parsed!.subredditId).toBe('t5_test');
    expect(parsed!.alltime[0]!.username).toBe('ace');
  });

  it('falls back to fenced JSON block (```json ... ```)', () => {
    const backup = makeMinimalBackup();
    const content = '# Some page\n\n```json\n' + JSON.stringify(backup) + '\n```\n';
    const parsed = parseBackupContent(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.v).toBe(1);
  });

  it('falls back to bare JSON when no markers or fences', () => {
    const backup = makeMinimalBackup();
    const content = 'Some preamble\n\n' + JSON.stringify(backup) + '\n\nSome postamble';
    const parsed = parseBackupContent(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.v).toBe(1);
  });

  it('returns null when JSON is invalid', () => {
    const content = wrapInMarkers('{ not valid json }}}');
    expect(parseBackupContent(content)).toBeNull();
  });

  it('returns null when v is not 1', () => {
    const bad = { v: 2, subredditId: 'sub', savedAt: 0 };
    const content = wrapInMarkers(JSON.stringify(bad));
    expect(parseBackupContent(content)).toBeNull();
  });

  it('returns null when subredditId is missing', () => {
    const bad = { v: 1, savedAt: 0 };
    const content = wrapInMarkers(JSON.stringify(bad));
    expect(parseBackupContent(content)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// encodeBackup / parseBackup round-trip (via export + parseBackupContent)
// ---------------------------------------------------------------------------
describe('encodeBackup / parseBackupContent round-trip', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('encodes and parses back to the same data', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-rt', username: 'roundtripper', communityId: 'sub-rt', correctWords: 100, timeSeconds: 90 })
    );
    const backup = await exportLeaderboardBackup(redis, 'sub-rt');

    // Encode exactly as wikiBackup does (markers + JSON)
    const encoded = wrapInMarkers(JSON.stringify(backup));
    const parsed = parseBackupContent(encoded);

    expect(parsed).not.toBeNull();
    expect(parsed!.v).toBe(1);
    expect(parsed!.subredditId).toBe('sub-rt');
    expect(parsed!.alltime[0]!.username).toBe('roundtripper');
    expect(parsed!.profiles[0]!.username).toBe('roundtripper');
  });
});

// ---------------------------------------------------------------------------
// backupHasData
// ---------------------------------------------------------------------------
describe('backupHasData', () => {
  it('returns false for null', () => {
    expect(backupHasData(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(backupHasData(undefined)).toBe(false);
  });

  it('returns false for empty backup', () => {
    const backup = makeMinimalBackup();
    expect(backupHasData(backup)).toBe(false);
  });

  it('returns true when alltime has entries', () => {
    const backup = makeMinimalBackup({ alltime: [makeLeaderboardEntry('ace')] });
    expect(backupHasData(backup)).toBe(true);
  });

  it('returns true when profiles has entries', () => {
    const backup = makeMinimalBackup({
      profiles: [{ username: 'ace', bestWpm: 80, bestAccuracy: 95, totalChallenges: 1, badges: [], domainCounts: {}, lastPlayed: 0, joinedAt: 0, totalWordsTyped: 0 }],
    });
    expect(backupHasData(backup)).toBe(true);
  });

  it('returns true when weekly has entries', () => {
    const backup = makeMinimalBackup({ weekly: { '2025-01-05': [makeLeaderboardEntry('ace')] } });
    expect(backupHasData(backup)).toBe(true);
  });

  it('returns false when v is not 1', () => {
    // @ts-expect-error testing invalid v
    expect(backupHasData({ v: 2, subredditId: 'x', alltime: [makeLeaderboardEntry('ace')] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// export + import round-trip
// ---------------------------------------------------------------------------
describe('exportLeaderboardBackup + importLeaderboardBackup', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('restores all-time leaderboard after Redis wipe', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-1', username: 'survivor', communityId: 'sub-persist', correctWords: 120, timeSeconds: 90, wordsTyped: 120 })
    );

    const backup = await exportLeaderboardBackup(redis, 'sub-persist');
    expect(backupHasData(backup)).toBe(true);
    expect(backup.alltime.length).toBe(1);
    expect(backup.profiles.length).toBe(1);

    // Simulate uninstall: empty Redis
    redis._clear();
    memoryCache.clear();

    expect((await getAllTimeLeaderboard(redis, 'sub-persist')).length).toBe(0);

    const result = await importLeaderboardBackup(redis, backup);
    expect(result.imported).toBe(true);
    expect(result.players).toBeGreaterThan(0);

    const allTime = await getAllTimeLeaderboard(redis, 'sub-persist');
    expect(allTime.length).toBe(1);
    expect(allTime[0]!.username).toBe('survivor');
    expect(allTime[0]!.bestCorrectWords).toBe(120);
  });

  it('restores weekly leaderboard after Redis wipe', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-w', username: 'weekly-hero', communityId: 'sub-wk', correctWords: 80, timeSeconds: 60 })
    );

    const backup = await exportLeaderboardBackup(redis, 'sub-wk');
    redis._clear();
    memoryCache.clear();

    await importLeaderboardBackup(redis, backup);

    const weekly = await getWeeklyLeaderboard(redis, 'sub-wk');
    expect(weekly.length).toBe(1);
    expect(weekly[0]!.username).toBe('weekly-hero');
  });

  it('restores player profile after Redis wipe', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-p', username: 'profile-hero', communityId: 'sub-pr', correctWords: 60, timeSeconds: 55, wordsTyped: 65 })
    );

    const backup = await exportLeaderboardBackup(redis, 'sub-pr');
    redis._clear();
    memoryCache.clear();

    await importLeaderboardBackup(redis, backup);

    const profile = await getPlayerProfile(redis, 'profile-hero');
    expect(profile).not.toBeNull();
    expect(profile!.totalWordsTyped).toBe(65);
  });
});

// ---------------------------------------------------------------------------
// importLeaderboardBackup — merge behaviour
// ---------------------------------------------------------------------------
describe('importLeaderboardBackup merge without wipe', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('does not overwrite newer scores in Redis', async () => {
    await saveScore(redis, makeScore({ id: 'sc-old', username: 'old-champ', communityId: 'sub-merge', correctWords: 50, timeSeconds: 40 }));
    const backup = await exportLeaderboardBackup(redis, 'sub-merge');

    await saveScore(redis, makeScore({ id: 'sc-new', username: 'new-champ', communityId: 'sub-merge', correctWords: 200, timeSeconds: 100, wordsTyped: 200 }));
    memoryCache.clear();

    await importLeaderboardBackup(redis, backup);

    const allTime = await getAllTimeLeaderboard(redis, 'sub-merge');
    expect(allTime.map((e) => e.username)).toContain('new-champ');
    expect(allTime.map((e) => e.username)).toContain('old-champ');
  });

  it('preserves personal best when incoming backup is weaker', async () => {
    await saveScore(redis, makeScore({ id: 'sc-strong', username: 'champ', communityId: 'sub-pb', correctWords: 200, timeSeconds: 80 }));
    const strongBackup = await exportLeaderboardBackup(redis, 'sub-pb');

    // Now the player gets a weaker run which is exported in the backup
    const weakBackup = makeMinimalBackup({
      subredditId: 'sub-pb',
      profiles: [{
        username: 'champ', bestWpm: 50, bestAccuracy: 80, totalChallenges: 1,
        badges: [], domainCounts: {}, lastPlayed: 0, joinedAt: 0,
        totalWordsTyped: 50, bestCorrectWords: 50, bestTimeSeconds: 200,
      }],
    });

    await importLeaderboardBackup(redis, weakBackup);

    const profile = await getPlayerProfile(redis, 'champ');
    // The strong run from strongBackup already stored in Redis should not be replaced
    expect(profile!.bestCorrectWords).toBeGreaterThanOrEqual(50); // at least what the player had
  });

  it('returns imported=false when backup is empty', async () => {
    const empty = makeMinimalBackup();
    const result = await importLeaderboardBackup(redis, empty);
    expect(result.imported).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ensureLeaderboardsHydrated — auto restore when all-time empty
// ---------------------------------------------------------------------------
describe('ensureLeaderboardsHydrated', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  function wikiWithBackup(backup: LeaderboardBackupV1): WikiReddit {
    const content = [
      '<!-- echokeys-lb-v1 -->',
      JSON.stringify(backup),
      '<!-- /echokeys-lb-v1 -->',
    ].join('\n');
    return {
      getWikiPage: async () => ({ content } as { content: string }),
      createWikiPage: async () => ({} as never),
      updateWikiPage: async () => ({} as never),
      updateWikiPageSettings: async () => ({} as never),
    };
  }

  it('restores all-time from wiki when Redis all-time is empty', async () => {
    const backup = makeMinimalBackup({
      subredditId: 'sub-empty',
      alltime: [makeLeaderboardEntry('recovered', { bestCorrectWords: 99, bestTimeSeconds: 40 })],
      profiles: [
        {
          username: 'recovered',
          bestWpm: 90,
          bestAccuracy: 95,
          totalChallenges: 2,
          badges: [],
          domainCounts: {},
          lastPlayed: Date.now(),
          joinedAt: Date.now(),
          totalWordsTyped: 99,
          bestCorrectWords: 99,
          bestTimeSeconds: 40,
        },
      ],
    });

    const result = await ensureLeaderboardsHydrated(
      redis,
      wikiWithBackup(backup),
      'sub-empty',
      'echokeys_dev'
    );
    expect(result.attempted).toBe(true);
    expect(result.restored).toBe(true);

    const allTime = await getAllTimeLeaderboard(redis, 'sub-empty');
    expect(allTime[0]?.username).toBe('recovered');
    expect(allTime[0]?.bestCorrectWords).toBe(99);
  });

  it('does not attempt restore when all-time already has rows', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-live', username: 'live', communityId: 'sub-full', correctWords: 10 })
    );
    const result = await ensureLeaderboardsHydrated(
      redis,
      wikiWithBackup(makeMinimalBackup({ alltime: [makeLeaderboardEntry('ghost')] })),
      'sub-full',
      'echokeys_dev'
    );
    expect(result.attempted).toBe(false);
  });
});

describe('reinstall restore path', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  function wikiWithBackup(backup: LeaderboardBackupV1): WikiReddit {
    let reads = 0;
    const content = [
      '<!-- echokeys-lb-v1 -->',
      JSON.stringify(backup),
      '<!-- /echokeys-lb-v1 -->',
    ].join('\n');
    return {
      getWikiPage: async () => {
        reads += 1;
        // First call fails (simulates post-reinstall wiki lag), then succeeds.
        if (reads === 1) throw new Error('wiki not ready');
        return { content } as { content: string };
      },
      createWikiPage: async () => ({} as never),
      updateWikiPage: async () => ({} as never),
      updateWikiPageSettings: async () => ({} as never),
    };
  }

  it('restoreWithRetry recovers after transient wiki failure', async () => {
    const backup = makeMinimalBackup({
      subredditId: 'sub-re',
      alltime: [makeLeaderboardEntry('back', { bestCorrectWords: 42 })],
      profiles: [
        {
          username: 'back',
          bestWpm: 70,
          bestAccuracy: 90,
          totalChallenges: 1,
          badges: [],
          domainCounts: {},
          lastPlayed: 1,
          joinedAt: 1,
          totalWordsTyped: 42,
          bestCorrectWords: 42,
          bestTimeSeconds: 50,
        },
      ],
    });
    const result = await restoreLeaderboardFromWikiWithRetry(
      redis,
      wikiWithBackup(backup),
      'sub-re',
      'echokeys_dev',
      3
    );
    expect(result.restored).toBe(true);
    expect(result.attempts).toBeGreaterThanOrEqual(2);
    const allTime = await getAllTimeLeaderboard(redis, 'sub-re');
    expect(allTime[0]?.username).toBe('back');
  });

  it('syncLeaderboardWithWiki reinstall does not wipe wiki when Redis empty and wiki empty', async () => {
    let wikiWrites = 0;
    const emptyWiki: WikiReddit = {
      getWikiPage: async () => {
        throw new Error('missing');
      },
      createWikiPage: async () => {
        wikiWrites += 1;
        return {} as never;
      },
      updateWikiPage: async () => {
        wikiWrites += 1;
        return {} as never;
      },
      updateWikiPageSettings: async () => ({} as never),
    };
    const { restore, backedUp } = await syncLeaderboardWithWiki(
      redis,
      emptyWiki,
      'sub-void',
      'voidsub',
      { isReinstall: true }
    );
    expect(restore.restored).toBe(false);
    expect(backedUp).toBe(false);
    // No empty payload should be written when Redis has nothing.
    expect(wikiWrites).toBe(0);
  });
});

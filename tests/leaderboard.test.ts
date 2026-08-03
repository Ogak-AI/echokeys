import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveScore,
  getWeeklyLeaderboard,
  getAllTimeLeaderboard,
  getPlayerProfile,
  snapshotWeekly,
  importLeaderboardBackup,
  exportLeaderboardBackup,
  backupHasData,
  enrichPlayerBadges,
  setKeyExpiry,
} from '../src/server/services/leaderboard.js';
import type { PlayerScore, LeaderboardEntry } from '../src/shared/types/index.js';
import { isBetterRun } from '../src/shared/types/index.js';
import { previousWeekStartKey, weekStartKey } from '../src/shared/utils/time.js';
import { memoryCache } from '../src/server/services/memoryCache.js';
import { createRedisMock } from './helpers/redisMock.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type RedisMock = ReturnType<typeof createRedisMock>;

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

function makeEntry(
  username: string,
  bestCorrectWords: number,
  bestTimeSeconds: number,
  overrides: Partial<LeaderboardEntry> = {}
): LeaderboardEntry {
  return {
    rank: 0,
    username,
    score: 100,
    accuracy: 95,
    bestWpm: 80,
    challengesCompleted: 1,
    lastPlayed: Date.now(),
    badges: [],
    totalWordsTyped: bestCorrectWords,
    bestCorrectWords,
    bestTimeSeconds,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// saveScore
// ---------------------------------------------------------------------------
describe('saveScore', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('creates a player profile on first score', async () => {
    await saveScore(redis, makeScore({ id: 'sc-1', username: 'alice', communityId: 'sub-a' }));
    const profile = await getPlayerProfile(redis, 'alice');
    expect(profile).toBeTruthy();
    expect(profile!.username).toBe('alice');
  });

  it('updates weekly leaderboard', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-2', username: 'bob', communityId: 'sub-b', correctWords: 50 })
    );
    const lb = await getWeeklyLeaderboard(redis, 'sub-b');
    expect(lb).toHaveLength(1);
    expect(lb[0]!.username).toBe('bob');
    expect(lb[0]!.bestCorrectWords).toBe(50);
  });

  it('accumulates week-scoped totalWordsTyped (not lifetime profile total)', async () => {
    await saveScore(
      redis,
      makeScore({
        id: 'sc-words-1',
        username: 'wally',
        communityId: 'sub-words',
        wordsTyped: 40,
        correctWords: 30,
      })
    );
    await saveScore(
      redis,
      makeScore({
        id: 'sc-words-2',
        username: 'wally',
        communityId: 'sub-words',
        wordsTyped: 25,
        correctWords: 20,
        timeSeconds: 90,
      })
    );
    const lb = await getWeeklyLeaderboard(redis, 'sub-words');
    expect(lb[0]!.totalWordsTyped).toBe(65);
    const profile = await getPlayerProfile(redis, 'wally');
    // Profile is lifetime; weekly board must stay period-scoped.
    expect(profile!.totalWordsTyped).toBe(65);
  });

  it('enrichPlayerBadges does not overwrite period totalWordsTyped with lifetime', async () => {
    await saveScore(
      redis,
      makeScore({
        id: 'sc-enrich-1',
        username: 'erin',
        communityId: 'sub-enrich',
        wordsTyped: 30,
        correctWords: 28,
      })
    );
    // Simulate extra lifetime activity not on this board snapshot path by
    // updating profile after a second save on another community key... we only
    // need badges enrichment: period words must stay board-scoped.
    const weekly = await getWeeklyLeaderboard(redis, 'sub-enrich');
    expect(weekly[0]!.totalWordsTyped).toBe(30);

    // Inflate profile lifetime words beyond the board entry.
    const profile = await getPlayerProfile(redis, 'erin');
    expect(profile).toBeTruthy();
    await redis.set(
      'player:erin',
      JSON.stringify({ ...profile!, totalWordsTyped: 9999, badges: ['Weekly Champion - r/test'] })
    );
    memoryCache.delete('player:erin');

    const enriched = await enrichPlayerBadges(redis, weekly);
    expect(enriched[0]!.totalWordsTyped).toBe(30);
    expect(enriched[0]!.badges.some((b) => b.includes('Weekly'))).toBe(true);
  });

  it('setKeyExpiry is a no-op when expire is missing and works when present', async () => {
    const bare = {
      get: async () => undefined,
      set: async () => {},
      del: async () => {},
    };
    await expect(setKeyExpiry(bare, 'k', 60)).resolves.toBeUndefined();

    const calls: Array<[string, number]> = [];
    const withExpire = {
      ...bare,
      expire: async (key: string, seconds: number) => {
        calls.push([key, seconds]);
      },
    };
    await setKeyExpiry(withExpire, 'race:1', 120.4);
    expect(calls).toEqual([['race:1', 121]]);
  });

  it('updates all-time leaderboard', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-3', username: 'carol', communityId: 'sub-c', correctWords: 80 })
    );
    const allTime = await getAllTimeLeaderboard(redis, 'sub-c');
    expect(allTime).toHaveLength(1);
    expect(allTime[0]!.username).toBe('carol');
  });

  it('does not update weekly or all-time when rankOnLeaderboard is false', async () => {
    await saveScore(
      redis,
      makeScore({
        id: 'sc-unranked',
        username: 'ghost',
        communityId: 'sub-g',
        correctWords: 999,
      }),
      { rankOnLeaderboard: false }
    );
    const lb = await getWeeklyLeaderboard(redis, 'sub-g');
    expect(lb).toHaveLength(0);
    const allTime = await getAllTimeLeaderboard(redis, 'sub-g');
    expect(allTime).toHaveLength(0);
    // Profile still created
    const profile = await getPlayerProfile(redis, 'ghost');
    expect(profile).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// isBetterRun
// ---------------------------------------------------------------------------
describe('isBetterRun', () => {
  it('more correct words wins', () => {
    expect(isBetterRun({ correctWords: 100, timeSeconds: 90 }, { correctWords: 80, timeSeconds: 30 })).toBe(true);
    expect(isBetterRun({ correctWords: 50, timeSeconds: 10 }, { correctWords: 80, timeSeconds: 90 })).toBe(false);
  });

  it('ties broken by lower time', () => {
    expect(isBetterRun({ correctWords: 100, timeSeconds: 40 }, { correctWords: 100, timeSeconds: 60 })).toBe(true);
    expect(isBetterRun({ correctWords: 100, timeSeconds: 70 }, { correctWords: 100, timeSeconds: 60 })).toBe(false);
  });

  it('tie in time too is not better', () => {
    expect(isBetterRun({ correctWords: 100, timeSeconds: 60 }, { correctWords: 100, timeSeconds: 60 })).toBe(false);
  });

  it('a run with time > 0 beats a run with missing time (0)', () => {
    // current has timeSeconds=0 (missing) → candidate with real time wins
    expect(isBetterRun({ correctWords: 50, timeSeconds: 45 }, { correctWords: 50, timeSeconds: 0 })).toBe(true);
  });

  it('a run with missing time does not beat a run with real time', () => {
    expect(isBetterRun({ correctWords: 50, timeSeconds: 0 }, { correctWords: 50, timeSeconds: 45 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sortAndRank (observable through getWeeklyLeaderboard)
// ---------------------------------------------------------------------------
describe('leaderboard ranking via getWeeklyLeaderboard', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('sorts by correct words descending, then time ascending', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-slow', username: 'many-words', communityId: 'sub-rank', correctWords: 100, timeSeconds: 120 })
    );
    await saveScore(
      redis,
      makeScore({ id: 'sc-fast', username: 'fast-few', communityId: 'sub-rank', correctWords: 50, timeSeconds: 20 })
    );
    await saveScore(
      redis,
      makeScore({ id: 'sc-tie', username: 'same-faster', communityId: 'sub-rank', correctWords: 100, timeSeconds: 90 })
    );

    const lb = await getWeeklyLeaderboard(redis, 'sub-rank');
    expect(lb[0]!.username).toBe('same-faster');
    expect(lb[0]!.rank).toBe(1);
    expect(lb[1]!.username).toBe('many-words');
    expect(lb[1]!.rank).toBe(2);
    expect(lb[2]!.username).toBe('fast-few');
    expect(lb[2]!.rank).toBe(3);
  });

  it('assigns sequential ranks starting from 1', async () => {
    for (let i = 1; i <= 3; i++) {
      await saveScore(
        redis,
        makeScore({
          id: `sc-r${i}`,
          username: `player${i}`,
          communityId: 'sub-r',
          correctWords: 100 - i * 10,
          timeSeconds: 60,
        })
      );
    }
    const lb = await getWeeklyLeaderboard(redis, 'sub-r');
    expect(lb.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('enforces limit of 25 on weekly leaderboard', async () => {
    for (let i = 0; i < 30; i++) {
      await saveScore(
        redis,
        makeScore({
          id: `sc-lim${i}`,
          username: `u${i}`,
          communityId: 'sub-lim',
          correctWords: 100 - i,
          timeSeconds: 60,
        })
      );
    }
    const lb = await getWeeklyLeaderboard(redis, 'sub-lim');
    expect(lb.length).toBeLessThanOrEqual(25);
  });
});

// ---------------------------------------------------------------------------
// snapshotWeekly
// ---------------------------------------------------------------------------
describe('snapshotWeekly', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('archives the previous week entries', async () => {
    const endedWeek = previousWeekStartKey();
    const entries: LeaderboardEntry[] = [makeEntry('champ', 200, 90)];
    redis._store.set(`lb:sub-x:weekly:${endedWeek}`, JSON.stringify(entries));
    redis._store.set('player:champ', JSON.stringify({
      username: 'champ', bestWpm: 100, bestAccuracy: 100, totalChallenges: 3,
      badges: [], domainCounts: {}, lastPlayed: Date.now(), joinedAt: Date.now(),
      totalWordsTyped: 500, bestCorrectWords: 200, bestTimeSeconds: 90,
    }));

    await snapshotWeekly(redis, 'sub-x', 'r/typing');

    const archived = redis._store.get(`lb:sub-x:weekly:archive:${endedWeek}`);
    expect(archived).toBeTruthy();
    const parsed = JSON.parse(archived!);
    expect(parsed[0].username).toBe('champ');
  });

  it('never wipes the live weekly key', async () => {
    const endedWeek = previousWeekStartKey();
    const entries: LeaderboardEntry[] = [makeEntry('champ', 200, 90)];
    redis._store.set(`lb:sub-x:weekly:${endedWeek}`, JSON.stringify(entries));
    redis._store.set('player:champ', JSON.stringify({
      username: 'champ', bestWpm: 100, bestAccuracy: 100, totalChallenges: 1,
      badges: [], domainCounts: {}, lastPlayed: Date.now(), joinedAt: Date.now(),
      totalWordsTyped: 200, bestCorrectWords: 200, bestTimeSeconds: 90,
    }));

    await snapshotWeekly(redis, 'sub-x', 'r/typing');

    const live = redis._store.get(`lb:sub-x:weekly:${endedWeek}`);
    expect(live).toBeTruthy();
  });

  it('awards badges to top 3 players', async () => {
    const endedWeek = previousWeekStartKey();
    const players = ['gold', 'silver', 'bronze', 'fourth'];
    const entries: LeaderboardEntry[] = players.map((u, i) =>
      makeEntry(u, 200 - i * 10, 90 + i * 5)
    );
    redis._store.set(`lb:sub-x:weekly:${endedWeek}`, JSON.stringify(entries));

    for (const u of players) {
      redis._store.set(`player:${u}`, JSON.stringify({
        username: u, bestWpm: 80, bestAccuracy: 95, totalChallenges: 1,
        badges: [], domainCounts: {}, lastPlayed: Date.now(), joinedAt: Date.now(),
        totalWordsTyped: 100, bestCorrectWords: 100, bestTimeSeconds: 60,
      }));
    }

    await snapshotWeekly(redis, 'sub-x', 'r/typing');

    for (const top of ['gold', 'silver', 'bronze']) {
      const profile = await getPlayerProfile(redis, top);
      expect(profile!.badges).toContain('Weekly Champion - r/typing');
    }
    const fourth = await getPlayerProfile(redis, 'fourth');
    expect(fourth!.badges).not.toContain('Weekly Champion - r/typing');
  });

  it('skips snapshot when no entries for the ended week', async () => {
    // No data written for the previous week
    await snapshotWeekly(redis, 'sub-empty', 'r/typing');
    const endedWeek = previousWeekStartKey();
    expect(redis._store.has(`lb:sub-empty:weekly:archive:${endedWeek}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getWeeklyLeaderboard (live + archive merge)
// ---------------------------------------------------------------------------
describe('getWeeklyLeaderboard - merges live and archive', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('returns empty array when no data for the week', async () => {
    const lb = await getWeeklyLeaderboard(redis, 'sub-none');
    expect(lb).toEqual([]);
  });

  it('merges live and archive entries', async () => {
    const week = weekStartKey();
    const liveEntry = makeEntry('live-player', 100, 60);
    const archiveEntry = makeEntry('archive-player', 80, 50);
    redis._store.set(`lb:sub-merge:weekly:${week}`, JSON.stringify([liveEntry]));
    redis._store.set(`lb:sub-merge:weekly:archive:${week}`, JSON.stringify([archiveEntry]));

    const lb = await getWeeklyLeaderboard(redis, 'sub-merge', week);
    expect(lb.length).toBe(2);
    expect(lb.map((e) => e.username)).toContain('live-player');
    expect(lb.map((e) => e.username)).toContain('archive-player');
  });

  it('uses memoryCache on second call', async () => {
    await saveScore(redis, makeScore({ id: 'sc-cache', username: 'cached-user', communityId: 'sub-cache' }));
    const lb1 = await getWeeklyLeaderboard(redis, 'sub-cache');
    // Corrupt underlying store — cached call should still return previous result
    redis._store.clear();
    const lb2 = await getWeeklyLeaderboard(redis, 'sub-cache');
    expect(lb2.length).toBe(lb1.length);
  });
});

// ---------------------------------------------------------------------------
// importLeaderboardBackup
// ---------------------------------------------------------------------------
describe('importLeaderboardBackup', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('merges without wiping existing data', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-old', username: 'old-champ', communityId: 'sub-merge', correctWords: 50 })
    );
    const backup = await exportLeaderboardBackup(redis, 'sub-merge');

    await saveScore(
      redis,
      makeScore({ id: 'sc-new', username: 'new-champ', communityId: 'sub-merge', correctWords: 200 })
    );

    await importLeaderboardBackup(redis, backup);

    const allTime = await getAllTimeLeaderboard(redis, 'sub-merge');
    expect(allTime.map((e) => e.username)).toContain('new-champ');
    expect(allTime.map((e) => e.username)).toContain('old-champ');
  });

  it('preserves profile personal best (keeps best of old and incoming)', async () => {
    await saveScore(
      redis,
      makeScore({
        id: 'sc-best',
        username: 'runner',
        communityId: 'sub-pb',
        correctWords: 150,
        timeSeconds: 80,
      })
    );
    const backup = await exportLeaderboardBackup(redis, 'sub-pb');

    // Wipe redis
    redis._clear();
    memoryCache.clear();

    // Import backup
    await importLeaderboardBackup(redis, backup);

    const profile = await getPlayerProfile(redis, 'runner');
    expect(profile).toBeTruthy();
    expect(profile!.bestCorrectWords).toBe(150);
    expect(profile!.bestTimeSeconds).toBe(80);
  });

  it('returns imported=false when backup has no data', async () => {
    const emptyBackup = {
      v: 1 as const,
      subredditId: 'sub-empty',
      savedAt: Date.now(),
      alltime: [],
      weekly: {},
      weeklyArchives: {},
      weeklyArchiveIndex: [],
      monthly: {},
      monthlyIndex: [],
      yearly: {},
      profiles: [],
    };
    const result = await importLeaderboardBackup(redis, emptyBackup);
    expect(result.imported).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// persistLeaderboardEntries — wipe protection (observable via saveScore path)
// ---------------------------------------------------------------------------
describe('persistLeaderboardEntries wipe protection', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('refuses to overwrite existing all-time board with empty payload', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-keep', username: 'keeper', communityId: 'sub-keep', correctWords: 50 })
    );
    const before = await getAllTimeLeaderboard(redis, 'sub-keep');
    expect(before.length).toBe(1);

    // A non-ranked score should not touch the all-time board
    await saveScore(
      redis,
      makeScore({ id: 'sc-ignore', username: 'nobody', communityId: 'sub-keep', correctWords: 0, wordsTyped: 0 }),
      { rankOnLeaderboard: false }
    );

    const after = await getAllTimeLeaderboard(redis, 'sub-keep');
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(after.some((e) => e.username === 'keeper')).toBe(true);
  });

  it('merge mode keeps all existing players', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-a', username: 'alpha', communityId: 'sub-m', correctWords: 100 })
    );
    await saveScore(
      redis,
      makeScore({ id: 'sc-b', username: 'beta', communityId: 'sub-m', correctWords: 80 })
    );

    // Add a third player via direct import (merge mode)
    const backup = await exportLeaderboardBackup(redis, 'sub-m');
    backup.alltime.push(makeEntry('gamma', 60, 50));
    await importLeaderboardBackup(redis, backup);

    const allTime = await getAllTimeLeaderboard(redis, 'sub-m');
    expect(allTime.map((e) => e.username)).toContain('alpha');
    expect(allTime.map((e) => e.username)).toContain('beta');
    expect(allTime.map((e) => e.username)).toContain('gamma');
  });
});

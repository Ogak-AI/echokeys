import { describe, it, expect, beforeEach } from 'vitest';
import {
  checksumEntries,
  freezeSnapshot,
  getFrozenSnapshot,
  listFrozenPeriods,
  verifyPermanenceIntegrity,
  ensurePermanenceMeta,
  bootstrapPermanence,
} from '../src/server/services/permanence.js';
import { snapshotWeekly, saveScore } from '../src/server/services/leaderboard.js';
import { previousWeekStartKey } from '../src/shared/utils/time.js';
import type { LeaderboardEntry, PlayerScore } from '../src/shared/types/index.js';
import { memoryCache } from '../src/server/services/memoryCache.js';
import { createRedisMock } from './helpers/redisMock.js';
import { PERMANENCE_SCHEMA_VERSION } from '../src/shared/types/permanence.js';

type RedisMock = ReturnType<typeof createRedisMock>;

function entry(username: string, words: number, time: number): LeaderboardEntry {
  return {
    rank: 0,
    username,
    score: 100,
    accuracy: 95,
    bestWpm: 80,
    challengesCompleted: 1,
    lastPlayed: Date.now(),
    badges: [],
    totalWordsTyped: words,
    bestCorrectWords: words,
    bestTimeSeconds: time,
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

describe('checksumEntries', () => {
  it('is stable for the same ranked content', () => {
    const a = [entry('alice', 100, 50), entry('bob', 90, 40)];
    a.forEach((e, i) => {
      e.rank = i + 1;
    });
    expect(checksumEntries(a)).toBe(checksumEntries(a.map((e) => ({ ...e }))));
  });

  it('changes when winners change', () => {
    const a = [entry('alice', 100, 50)];
    const b = [entry('bob', 100, 50)];
    a[0]!.rank = 1;
    b[0]!.rank = 1;
    expect(checksumEntries(a)).not.toBe(checksumEntries(b));
  });
});

describe('freezeSnapshot immutability', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('creates a frozen snapshot and refuses divergent overwrite', async () => {
    const first = await freezeSnapshot(redis, {
      communityId: 'sub-1',
      kind: 'weekly',
      periodKey: '2026-07-26',
      entries: [entry('alice', 100, 40)],
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.created).toBe(true);
      expect(first.snapshot.frozen).toBe(true);
      expect(first.snapshot.checksum).toMatch(/^fnv1a32:/);
    }

    const clash = await freezeSnapshot(redis, {
      communityId: 'sub-1',
      kind: 'weekly',
      periodKey: '2026-07-26',
      entries: [entry('bob', 200, 30)],
    });
    expect(clash.ok).toBe(false);
    if (!clash.ok) {
      expect(clash.error).toMatch(/different content/i);
    }

    // Original winner preserved
    const stored = await getFrozenSnapshot(redis, 'sub-1', 'weekly', '2026-07-26');
    expect(stored?.entries[0]?.username).toBe('alice');
  });

  it('is idempotent when content matches', async () => {
    const rows = [entry('alice', 100, 40)];
    const a = await freezeSnapshot(redis, {
      communityId: 'sub-1',
      kind: 'monthly',
      periodKey: '2026-07',
      entries: rows,
    });
    const b = await freezeSnapshot(redis, {
      communityId: 'sub-1',
      kind: 'monthly',
      periodKey: '2026-07',
      entries: rows,
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.created).toBe(true);
      expect(b.created).toBe(false);
      expect(b.reason).toBe('idempotent');
    }
  });

  it('refuses empty freezes', async () => {
    const r = await freezeSnapshot(redis, {
      communityId: 'sub-1',
      kind: 'yearly',
      periodKey: '2025',
      entries: [],
    });
    expect(r.ok).toBe(false);
  });

  it('lists frozen periods newest first', async () => {
    await freezeSnapshot(redis, {
      communityId: 'sub-1',
      kind: 'weekly',
      periodKey: '2026-07-19',
      entries: [entry('a', 10, 10)],
    });
    await freezeSnapshot(redis, {
      communityId: 'sub-1',
      kind: 'weekly',
      periodKey: '2026-07-26',
      entries: [entry('b', 20, 10)],
    });
    const periods = await listFrozenPeriods(redis, 'sub-1', 'weekly');
    expect(periods[0]).toBe('2026-07-26');
    expect(periods).toContain('2026-07-19');
  });
});

describe('integrity + bootstrap', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('bootstraps meta at current schema version', async () => {
    const { meta, integrity } = await bootstrapPermanence(redis, 'sub-boot');
    expect(meta.schemaVersion).toBe(PERMANENCE_SCHEMA_VERSION);
    expect(integrity.ok).toBe(true);
  });

  it('detects checksum corruption', async () => {
    await freezeSnapshot(redis, {
      communityId: 'sub-c',
      kind: 'weekly',
      periodKey: '2026-01-01',
      entries: [entry('alice', 50, 30)],
    });
    // Corrupt the stored document without going through freezeSnapshot
    const key = 'perm:snap:sub-c:weekly:2026-01-01';
    const raw = await redis.get(key);
    const parsed = JSON.parse(raw!);
    parsed.entries[0].bestCorrectWords = 9999;
    await redis.set(key, JSON.stringify(parsed));

    const report = await verifyPermanenceIntegrity(redis, 'sub-c');
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'CHECKSUM_MISMATCH')).toBe(true);
  });

  it('ensurePermanenceMeta never wipes migration history on bump', async () => {
    await ensurePermanenceMeta(redis, 'sub-m');
    // Simulate older schema
    await redis.set(
      'perm:meta:sub-m',
      JSON.stringify({
        v: 1,
        schemaVersion: 1,
        communityId: 'sub-m',
        createdAt: 1,
        updatedAt: 1,
        migrations: [{ id: 'old', fromVersion: 0, toVersion: 1, appliedAt: 1, ok: true }],
      })
    );
    const next = await ensurePermanenceMeta(redis, 'sub-m');
    expect(next.schemaVersion).toBe(PERMANENCE_SCHEMA_VERSION);
    expect(next.migrations.length).toBeGreaterThanOrEqual(2);
    expect(next.migrations[0]?.id).toBe('old');
  });
});

describe('snapshotWeekly freezes history and preserves winners', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('freezes previous week and re-run does not change winners', async () => {
    const sub = 'sub-freeze';
    // Seed live board for the previous week key by writing archive path via score
    // on current week, then manually place entries on previous week live key.
    const ended = previousWeekStartKey();
    await redis.set(
      `lb:${sub}:weekly:${ended}`,
      JSON.stringify([
        { ...entry('champ', 120, 55), rank: 1 },
        { ...entry('runner', 100, 60), rank: 2 },
      ])
    );

    await snapshotWeekly(redis, sub, 'testsub', new Date());
    const snap1 = await getFrozenSnapshot(redis, sub, 'weekly', ended);
    expect(snap1?.entries[0]?.username).toBe('champ');

    // Attempt to change live archive source then re-snapshot
    await redis.set(
      `lb:${sub}:weekly:${ended}`,
      JSON.stringify([{ ...entry('impostor', 999, 10), rank: 1 }])
    );
    await snapshotWeekly(redis, sub, 'testsub', new Date());
    const snap2 = await getFrozenSnapshot(redis, sub, 'weekly', ended);
    // Frozen layer must keep original champion
    expect(snap2?.entries[0]?.username).toBe('champ');
  });
});

describe('career stats permanence', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('accumulates career race counters on saveScore', async () => {
    await saveScore(
      redis,
      makeScore({ id: 'sc-c1', username: 'career', communityId: 'sub-c', correctWords: 40 })
    );
    await saveScore(
      redis,
      makeScore({
        id: 'sc-c2',
        username: 'career',
        communityId: 'sub-c',
        correctWords: 20,
        timeSeconds: 90,
      }),
      { rankOnLeaderboard: false }
    );
    const raw = await redis.get('player:career');
    const profile = JSON.parse(raw!);
    expect(profile.career.totalRaces).toBe(2);
    expect(profile.career.rankedRaces).toBe(1);
    expect(profile.career.firstRaceAt).toBeTruthy();
    expect(profile.career.lastRaceAt).toBeTruthy();
  });
});

describe('deployments do not erase frozen keys', () => {
  let redis: RedisMock;

  beforeEach(() => {
    memoryCache.clear();
    redis = createRedisMock();
  });

  it('bootstrap after freeze keeps snapshots', async () => {
    await freezeSnapshot(redis, {
      communityId: 'sub-d',
      kind: 'yearly',
      periodKey: '2025',
      entries: [entry('legend', 500, 200)],
    });
    await bootstrapPermanence(redis, 'sub-d');
    const snap = await getFrozenSnapshot(redis, 'sub-d', 'yearly', '2025');
    expect(snap?.entries[0]?.username).toBe('legend');
  });
});

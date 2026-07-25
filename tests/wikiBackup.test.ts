import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportLeaderboardBackup,
  importLeaderboardBackup,
  backupHasData,
  saveScore,
  getAllTimeLeaderboard,
  getWeeklyLeaderboard,
  getPlayerProfile,
} from '../src/server/services/leaderboard.ts';
import type { PlayerScore } from '../src/shared/types/index.ts';
import { parseBackupContent } from '../src/server/services/wikiBackup.ts';
import { memoryCache } from '../src/server/services/memoryCache.ts';

class MockRedis {
  data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key);
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
  }
  async del(...keys: string[]) {
    for (const key of keys) this.data.delete(key);
  }
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

test('parseBackupContent reads marker-wrapped JSON', () => {
  const page = [
    '# Echokeys leaderboard backup',
    '<!-- echokeys-lb-v1 -->',
    JSON.stringify({
      v: 1,
      subredditId: 't5_test',
      savedAt: 1,
      alltime: [{ rank: 1, username: 'ace', score: 1, accuracy: 100, bestWpm: 100, challengesCompleted: 1, lastPlayed: 1, badges: [], totalWordsTyped: 10, bestCorrectWords: 10, bestTimeSeconds: 5 }],
      weekly: {},
      weeklyArchives: {},
      weeklyArchiveIndex: [],
      monthly: {},
      monthlyIndex: [],
      yearly: {},
      profiles: [],
    }),
    '<!-- /echokeys-lb-v1 -->',
  ].join('\n');

  const parsed = parseBackupContent(page);
  assert.ok(parsed);
  assert.equal(parsed.v, 1);
  assert.equal(parsed.subredditId, 't5_test');
  assert.equal(parsed.alltime[0]?.username, 'ace');
});

test('export + import restores all-time after redis wipe', async () => {
  memoryCache.clear();
  const redis = new MockRedis();

  await saveScore(
    redis,
    makeScore({
      id: 'sc-1',
      username: 'survivor',
      communityId: 'sub-persist',
      correctWords: 120,
      timeSeconds: 90,
      wordsTyped: 120,
    })
  );

  const backup = await exportLeaderboardBackup(redis, 'sub-persist');
  assert.ok(backupHasData(backup));
  assert.equal(backup.alltime.length, 1);
  assert.equal(backup.profiles.length, 1);

  // Simulate uninstall: empty Redis
  redis.data.clear();
  memoryCache.clear();

  assert.equal((await getAllTimeLeaderboard(redis, 'sub-persist')).length, 0);

  const result = await importLeaderboardBackup(redis, backup);
  assert.equal(result.imported, true);

  const allTime = await getAllTimeLeaderboard(redis, 'sub-persist');
  assert.equal(allTime.length, 1);
  assert.equal(allTime[0]?.username, 'survivor');
  assert.equal(allTime[0]?.bestCorrectWords, 120);

  const weekly = await getWeeklyLeaderboard(redis, 'sub-persist');
  assert.equal(weekly.length, 1);

  const profile = await getPlayerProfile(redis, 'survivor');
  assert.ok(profile);
  assert.equal(profile.totalWordsTyped, 120);
});

test('import merges without wiping newer redis scores', async () => {
  memoryCache.clear();
  const redis = new MockRedis();

  await saveScore(
    redis,
    makeScore({
      id: 'sc-old',
      username: 'old-champ',
      communityId: 'sub-merge',
      correctWords: 50,
      timeSeconds: 40,
    })
  );
  const backup = await exportLeaderboardBackup(redis, 'sub-merge');

  await saveScore(
    redis,
    makeScore({
      id: 'sc-new',
      username: 'new-champ',
      communityId: 'sub-merge',
      correctWords: 200,
      timeSeconds: 100,
      wordsTyped: 200,
    })
  );

  await importLeaderboardBackup(redis, backup);

  const allTime = await getAllTimeLeaderboard(redis, 'sub-merge');
  assert.equal(allTime.length, 2);
  assert.equal(allTime[0]?.username, 'new-champ');
  assert.ok(allTime.some((e) => e.username === 'old-champ'));
});

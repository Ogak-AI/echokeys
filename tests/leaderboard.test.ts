import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveScore,
  getWeeklyLeaderboard,
  getPlayerProfile,
  snapshotWeekly,
  getAllTimeLeaderboard,
} from '../src/server/services/leaderboard.ts';
import type { PlayerScore } from '../src/shared/types/index.ts';
import { previousWeekStartKey, weekStartKey } from '../src/shared/utils/time.ts';
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
    for (const key of keys) {
      this.data.delete(key);
    }
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
    ...partial,
  };
}

test('leaderboard partitions by community and accumulates lifetime words', async () => {
  memoryCache.clear();
  const redis = new MockRedis();

  await saveScore(
    redis,
    makeScore({
      id: 'sc-1',
      username: 'user1',
      communityId: 'sub-a',
      score: 174,
      wordsTyped: 80,
    })
  );
  await saveScore(
    redis,
    makeScore({
      id: 'sc-2',
      username: 'user1',
      communityId: 'sub-b',
      wpm: 90,
      accuracy: 98,
      timeSeconds: 50,
      score: 187.17,
      wordsTyped: 100,
    })
  );

  const lbA = await getWeeklyLeaderboard(redis, 'sub-a');
  const lbB = await getWeeklyLeaderboard(redis, 'sub-b');

  assert.equal(lbA.length, 1);
  assert.equal(lbA[0]?.score, 174);
  assert.equal(lbA[0]?.totalWordsTyped, 80);

  assert.equal(lbB.length, 1);
  assert.equal(lbB[0]?.score, 187.17);
  assert.equal(lbB[0]?.totalWordsTyped, 180);

  const profile = await getPlayerProfile(redis, 'user1');
  assert.ok(profile);
  assert.equal(profile.totalWordsTyped, 180);

  // All-time updates live on each score (not only on Sunday snapshot)
  const allTimeA = await getAllTimeLeaderboard(redis, 'sub-a');
  assert.equal(allTimeA.length, 1);
  assert.equal(allTimeA[0]?.username, 'user1');
  assert.equal(allTimeA[0]?.totalWordsTyped, 80);
});

test('weekly snapshot archives, awards badges, and feeds all-time top 100', async () => {
  memoryCache.clear();
  const redis = new MockRedis();
  const endedWeek = previousWeekStartKey();

  const entries = [
    {
      rank: 1,
      username: 'champ',
      score: 200,
      accuracy: 100,
      bestWpm: 100,
      challengesCompleted: 3,
      lastPlayed: Date.now(),
      badges: [] as string[],
      totalWordsTyped: 500,
    },
    {
      rank: 2,
      username: 'runner',
      score: 180,
      accuracy: 98,
      bestWpm: 90,
      challengesCompleted: 2,
      lastPlayed: Date.now(),
      badges: [] as string[],
      totalWordsTyped: 300,
    },
  ];

  await redis.set(`lb:sub-x:weekly:${endedWeek}`, JSON.stringify(entries));
  await redis.set(
    'player:champ',
    JSON.stringify({
      username: 'champ',
      bestWpm: 100,
      bestAccuracy: 100,
      totalChallenges: 3,
      badges: [],
      domainCounts: {},
      lastPlayed: Date.now(),
      joinedAt: Date.now(),
      totalWordsTyped: 500,
    })
  );
  await redis.set(
    'player:runner',
    JSON.stringify({
      username: 'runner',
      bestWpm: 90,
      bestAccuracy: 98,
      totalChallenges: 2,
      badges: [],
      domainCounts: {},
      lastPlayed: Date.now(),
      joinedAt: Date.now(),
      totalWordsTyped: 300,
    })
  );

  await snapshotWeekly(redis, 'sub-x', 'r/typing');

  const archived = await redis.get(`lb:sub-x:weekly:archive:${endedWeek}`);
  assert.ok(archived);
  assert.equal(await redis.get(`lb:sub-x:weekly:${endedWeek}`), undefined);

  const champ = await getPlayerProfile(redis, 'champ');
  assert.ok(champ?.badges.includes('Weekly Champion - r/typing'));

  const allTime = await getAllTimeLeaderboard(redis, 'sub-x');
  assert.equal(allTime.length, 2);
  assert.equal(allTime[0]?.username, 'champ');
});

test('current week key is Sunday UTC', () => {
  const key = weekStartKey(new Date('2026-07-15T12:00:00.000Z')); // Wednesday
  assert.equal(key, '2026-07-12'); // previous Sunday
});

test('best weekly score is kept; challenge count increments', async () => {
  memoryCache.clear();
  const redis = new MockRedis();

  await saveScore(
    redis,
    makeScore({ id: 'sc-a', username: 'ace', communityId: 'sub-z', score: 150, wpm: 70 })
  );
  await saveScore(
    redis,
    makeScore({ id: 'sc-b', username: 'ace', communityId: 'sub-z', score: 120, wpm: 90 })
  );

  const lb = await getWeeklyLeaderboard(redis, 'sub-z');
  assert.equal(lb.length, 1);
  assert.equal(lb[0]?.score, 150); // best score kept
  assert.equal(lb[0]?.bestWpm, 90); // best wpm updated
  assert.equal(lb[0]?.challengesCompleted, 2);
});

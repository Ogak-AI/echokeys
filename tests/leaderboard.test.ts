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
    correctWords: 76,
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
      correctWords: 76,
      timeSeconds: 60,
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
      correctWords: 98,
    })
  );

  const lbA = await getWeeklyLeaderboard(redis, 'sub-a');
  const lbB = await getWeeklyLeaderboard(redis, 'sub-b');

  assert.equal(lbA.length, 1);
  assert.equal(lbA[0]?.bestCorrectWords, 76);
  assert.equal(lbA[0]?.bestTimeSeconds, 60);
  assert.equal(lbA[0]?.totalWordsTyped, 80);

  assert.equal(lbB.length, 1);
  assert.equal(lbB[0]?.bestCorrectWords, 98);
  assert.equal(lbB[0]?.bestTimeSeconds, 50);
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
      bestCorrectWords: 200,
      bestTimeSeconds: 90,
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
      bestCorrectWords: 150,
      bestTimeSeconds: 80,
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

test('best weekly run is most correct words then lowest time; challenge count increments', async () => {
  memoryCache.clear();
  const redis = new MockRedis();

  // First run: 70 correct in 60s
  await saveScore(
    redis,
    makeScore({
      id: 'sc-a',
      username: 'ace',
      communityId: 'sub-z',
      score: 150,
      wpm: 70,
      correctWords: 70,
      timeSeconds: 60,
    })
  );
  // Worse composite score but more correct words → becomes best run
  await saveScore(
    redis,
    makeScore({
      id: 'sc-b',
      username: 'ace',
      communityId: 'sub-z',
      score: 120,
      wpm: 90,
      correctWords: 90,
      timeSeconds: 55,
    })
  );
  // Same correct words, slower time → does not replace best run
  await saveScore(
    redis,
    makeScore({
      id: 'sc-c',
      username: 'ace',
      communityId: 'sub-z',
      score: 200,
      wpm: 100,
      correctWords: 90,
      timeSeconds: 80,
    })
  );
  // Same correct words, faster time → replaces best run
  await saveScore(
    redis,
    makeScore({
      id: 'sc-d',
      username: 'ace',
      communityId: 'sub-z',
      score: 110,
      wpm: 95,
      correctWords: 90,
      timeSeconds: 40,
    })
  );

  const lb = await getWeeklyLeaderboard(redis, 'sub-z');
  assert.equal(lb.length, 1);
  assert.equal(lb[0]?.bestCorrectWords, 90);
  assert.equal(lb[0]?.bestTimeSeconds, 40);
  assert.equal(lb[0]?.bestWpm, 100); // peak WPM still tracked
  assert.equal(lb[0]?.challengesCompleted, 4);
});

test('leaderboard ranks players by correct words then time', async () => {
  memoryCache.clear();
  const redis = new MockRedis();

  await saveScore(
    redis,
    makeScore({
      id: 'sc-slow',
      username: 'many-words',
      communityId: 'sub-rank',
      correctWords: 100,
      timeSeconds: 120,
      wordsTyped: 100,
    })
  );
  await saveScore(
    redis,
    makeScore({
      id: 'sc-fast',
      username: 'fast-few',
      communityId: 'sub-rank',
      correctWords: 50,
      timeSeconds: 20,
      wordsTyped: 50,
    })
  );
  await saveScore(
    redis,
    makeScore({
      id: 'sc-tie',
      username: 'same-words-faster',
      communityId: 'sub-rank',
      correctWords: 100,
      timeSeconds: 90,
      wordsTyped: 100,
    })
  );

  const lb = await getWeeklyLeaderboard(redis, 'sub-rank');
  assert.equal(lb.length, 3);
  // 100 correct @ 90s beats 100 correct @ 120s; both beat 50 correct
  assert.equal(lb[0]?.username, 'same-words-faster');
  assert.equal(lb[0]?.rank, 1);
  assert.equal(lb[1]?.username, 'many-words');
  assert.equal(lb[1]?.rank, 2);
  assert.equal(lb[2]?.username, 'fast-few');
  assert.equal(lb[2]?.rank, 3);
});

test('low-progress scores store history but do not rank on leaderboard', async () => {
  memoryCache.clear();
  const redis = new MockRedis();

  await saveScore(
    redis,
    makeScore({
      id: 'sc-partial',
      username: 'dabbler',
      communityId: 'sub-p',
      score: 999,
      wpm: 200,
      completed: false,
      wordsTyped: 10,
    }),
    { rankOnLeaderboard: false }
  );

  const lb = await getWeeklyLeaderboard(redis, 'sub-p');
  assert.equal(lb.length, 0);

  const allTime = await getAllTimeLeaderboard(redis, 'sub-p');
  assert.equal(allTime.length, 0);

  const profile = await getPlayerProfile(redis, 'dabbler');
  assert.ok(profile);
  assert.equal(profile.totalChallenges, 0); // incomplete
  assert.equal(profile.totalWordsTyped, 10);
  assert.equal(profile.bestWpm, 200); // still recorded on profile
});

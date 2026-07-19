import test from 'node:test';
import assert from 'node:assert/strict';
import { saveScore, getWeeklyLeaderboard, getPlayerProfile } from '../src/server/services/leaderboard.ts';
import type { PlayerScore } from '../src/shared/types/index.ts';

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

test('leaderboard partitions score and profile accumulates words', async () => {
  const redis = new MockRedis();

  const scoreSubA: PlayerScore = {
    id: 'sc-1',
    username: 'user1',
    challengeId: 'ch-1',
    wpm: 80,
    accuracy: 95,
    timeSeconds: 60,
    score: 174,
    completed: true,
    playedAt: Date.now(),
    communityId: 'sub-a',
    wordsTyped: 80,
  };

  const scoreSubB: PlayerScore = {
    id: 'sc-2',
    username: 'user1',
    challengeId: 'ch-2',
    wpm: 90,
    accuracy: 98,
    timeSeconds: 50,
    score: 187.17,
    completed: true,
    playedAt: Date.now(),
    communityId: 'sub-b',
    wordsTyped: 100,
  };

  await saveScore(redis, scoreSubA);
  await saveScore(redis, scoreSubB);

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
});


import { updateUserStats } from './index';
import { redis } from '@devvit/web/server';

describe('updateUserStats', () => {
  afterEach(async () => {
    await redis.del('user:test:stats');
    await redis.del('leaderboard');
  });

  it('should update user stats and leaderboard correctly', async () => {
    const result = {
      wpm: 100,
      accuracy: 95,
      time: 60000,
      challengeId: 'test-challenge',
    };

    const { newHighScore, rank } = await updateUserStats('test', result);

    expect(newHighScore).toBe(true);
    expect(rank).toBe(1);

    const stats = await redis.hGetAll('user:test:stats');
    expect(stats.bestWPM).toBe('100');
    expect(stats.bestAccuracy).toBe('95');
    expect(stats.totalGames).toBe('1');
    expect(stats.streak).toBe('1');

    const leaderboard = await redis.zRange('leaderboard', 0, -1);
    expect(leaderboard.length).toBe(1);
    expect(leaderboard[0]!.score).toBe(100);
  });
});

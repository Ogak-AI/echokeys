import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTournament,
  joinTournament,
  recordTournamentScore,
  getTournamentStandings,
  listCommunityTournaments,
  sanitizeTournamentName,
} from '../src/server/services/tournament.ts';
import type { PlayerScore } from '../src/shared/types/index.ts';
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

test('sanitizeTournamentName trims and bounds length', () => {
  assert.equal(sanitizeTournamentName('  Hello   World  ', 'x'), 'Hello World');
  assert.equal(sanitizeTournamentName('', 'Fallback Name').startsWith('Fallback'), true);
  assert.ok(sanitizeTournamentName('a'.repeat(200), 'x').length <= 80);
});

test('create auto-joins creator; others can join', async () => {
  memoryCache.clear();
  const redis = new MockRedis();
  const t = await createTournament(redis, {
    id: 'trn-1',
    name: 'Friday Race',
    communityId: 'sub-a',
    createdBy: 'Host',
    challengeId: 'ch-1',
    maxPlayers: 3,
  });

  assert.equal(t.participants.length, 1);
  assert.ok(t.participants.includes('host'));
  assert.equal(t.status, 'open');

  const join = await joinTournament(redis, 'trn-1', 'alice');
  assert.equal(join.ok, true);
  if (join.ok) {
    assert.equal(join.alreadyJoined, false);
    assert.equal(join.tournament.participants.length, 2);
  }

  const again = await joinTournament(redis, 'trn-1', 'alice');
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(again.alreadyJoined, true);
});

test('full and closed tournaments reject joins', async () => {
  memoryCache.clear();
  const redis = new MockRedis();
  const now = Date.now();
  await createTournament(redis, {
    id: 'trn-full',
    name: 'Tiny',
    communityId: 'sub-b',
    createdBy: 'a',
    challengeId: 'ch-1',
    maxPlayers: 2,
    now,
  });
  await joinTournament(redis, 'trn-full', 'b', now);
  const full = await joinTournament(redis, 'trn-full', 'c', now);
  assert.equal(full.ok, false);

  await createTournament(redis, {
    id: 'trn-ended',
    name: 'Ended',
    communityId: 'sub-b',
    createdBy: 'a',
    challengeId: 'ch-1',
    durationMs: 60 * 60 * 1000,
    now: now - 2 * 60 * 60 * 1000,
  });
  const closed = await joinTournament(redis, 'trn-ended', 'z', now);
  assert.equal(closed.ok, false);
});

test('standings keep best run and require membership', async () => {
  memoryCache.clear();
  const redis = new MockRedis();
  await createTournament(redis, {
    id: 'trn-score',
    name: 'Score Cup',
    communityId: 'sub-c',
    createdBy: 'host',
    challengeId: 'ch-score',
  });
  await joinTournament(redis, 'trn-score', 'racer');

  const outsider = await recordTournamentScore(
    redis,
    'trn-score',
    makeScore({
      id: 'sc-x',
      username: 'outsider',
      communityId: 'sub-c',
      challengeId: 'ch-score',
      correctWords: 200,
    })
  );
  assert.equal(outsider.ok, false);

  await recordTournamentScore(
    redis,
    'trn-score',
    makeScore({
      id: 'sc-1',
      username: 'racer',
      communityId: 'sub-c',
      challengeId: 'ch-score',
      correctWords: 50,
      timeSeconds: 40,
    })
  );
  await recordTournamentScore(
    redis,
    'trn-score',
    makeScore({
      id: 'sc-2',
      username: 'racer',
      communityId: 'sub-c',
      challengeId: 'ch-score',
      correctWords: 80,
      timeSeconds: 55,
    })
  );
  // Worse run should not replace best
  await recordTournamentScore(
    redis,
    'trn-score',
    makeScore({
      id: 'sc-3',
      username: 'racer',
      communityId: 'sub-c',
      challengeId: 'ch-score',
      correctWords: 60,
      timeSeconds: 30,
    })
  );

  const standings = await getTournamentStandings(redis, 'trn-score');
  assert.equal(standings.length, 1);
  assert.equal(standings[0]?.bestCorrectWords, 80);
  assert.equal(standings[0]?.bestTimeSeconds, 55);
  assert.equal(standings[0]?.rank, 1);
});

test('listCommunityTournaments returns open tournaments first', async () => {
  memoryCache.clear();
  const redis = new MockRedis();
  const now = Date.now();
  await createTournament(redis, {
    id: 'trn-old',
    name: 'Old',
    communityId: 'sub-list',
    createdBy: 'a',
    challengeId: 'ch-1',
    durationMs: 60 * 60 * 1000,
    now: now - 3 * 60 * 60 * 1000,
  });
  await createTournament(redis, {
    id: 'trn-live',
    name: 'Live',
    communityId: 'sub-list',
    createdBy: 'b',
    challengeId: 'ch-2',
    now,
  });

  const list = await listCommunityTournaments(redis, 'sub-list', now);
  assert.ok(list.length >= 2);
  assert.equal(list[0]?.id, 'trn-live');
  assert.equal(list[0]?.status, 'open');
});

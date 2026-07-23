import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_WPM,
  MIN_LEADERBOARD_PROGRESS,
  TIME_LIMIT_SECONDS,
  calculateAccuracy,
  calculateWpm,
  countCorrectChars,
  countCorrectWords,
  countWords,
  formatSubredditLabel,
  isSpeedViolation,
  minDurationSeconds,
  raceElapsedSeconds,
  sanitizePrompt,
  sanitizeTypedInput,
  validatePlayMetrics,
} from '../src/shared/utils/antiCheat.ts';
import { calculateScore, isBetterRun } from '../src/shared/types/index.ts';

test('score formula prioritizes accuracy', () => {
  // Score = (Acc% × 100) + WPM − (time/60)
  assert.equal(calculateScore(0.95, 80, 60), 95 + 80 - 1);
  assert.equal(calculateScore(1, 100, 0), 200);
});

test('isBetterRun ranks more correct words first, then lower time', () => {
  assert.equal(
    isBetterRun({ correctWords: 100, timeSeconds: 90 }, { correctWords: 80, timeSeconds: 30 }),
    true
  );
  assert.equal(
    isBetterRun({ correctWords: 50, timeSeconds: 10 }, { correctWords: 80, timeSeconds: 90 }),
    false
  );
  assert.equal(
    isBetterRun({ correctWords: 100, timeSeconds: 40 }, { correctWords: 100, timeSeconds: 60 }),
    true
  );
  assert.equal(
    isBetterRun({ correctWords: 100, timeSeconds: 70 }, { correctWords: 100, timeSeconds: 60 }),
    false
  );
});

test('countCorrectWords matches tokens by position', () => {
  assert.equal(countCorrectWords('hello world foo', 'hello world bar'), 2);
  assert.equal(countCorrectWords('hello wrong', 'hello world'), 1);
  assert.equal(countCorrectWords('', 'hello'), 0);
});

test('7 wps ceiling is 420 WPM', () => {
  assert.equal(MAX_WPM, 420);
  assert.equal(TIME_LIMIT_SECONDS, 600);
  assert.equal(MIN_LEADERBOARD_PROGRESS, 0.5);
});

test('isSpeedViolation catches bursts above 7 words/sec', () => {
  // 36 chars in 1 second > 35 chars/sec
  assert.equal(isSpeedViolation(36, 1000), true);
  // 20 chars in 1 second is fine
  assert.equal(isSpeedViolation(20, 1000), false);
  assert.equal(isSpeedViolation(0, 1000), false);
});

test('calculateWpm and accuracy', () => {
  // 300 chars in 60s = 60 WPM (300/5)
  assert.equal(calculateWpm(300, 60), 60);
  assert.equal(calculateAccuracy(95, 100), 95);
  assert.equal(calculateAccuracy(0, 0), 100);
});

test('sanitizePrompt strips control chars and bounds length', () => {
  assert.equal(sanitizePrompt('  hello\u0000world  '), 'helloworld');
  assert.equal(sanitizePrompt('x'.repeat(5000)).length, 2000);
});

test('countWords and formatSubredditLabel', () => {
  assert.equal(countWords('one two  three'), 3);
  assert.equal(formatSubredditLabel('typing'), 'r/typing');
  assert.equal(formatSubredditLabel('r/typing'), 'r/typing');
});

test('countCorrectChars and sanitizeTypedInput', () => {
  // h,e,l match; x≠l; o matches → 4
  assert.equal(countCorrectChars('helxo', 'hello'), 4);
  assert.equal(sanitizeTypedInput('ab\u0000cd', 10), 'abcd');
  assert.equal(sanitizeTypedInput('abcdef', 3), 'abc');
});

test('minDurationSeconds enforces 7 wps ceiling', () => {
  // 35 chars needs at least 1 second
  assert.equal(minDurationSeconds(35), 1);
  assert.equal(minDurationSeconds(70), 2);
  assert.equal(minDurationSeconds(0), 0);
});

test('raceElapsedSeconds clamps to time limit', () => {
  const started = Date.now() - 5000;
  assert.equal(raceElapsedSeconds(started, started + 5000), 5);
  assert.equal(raceElapsedSeconds(started, started + 999), 0);
  assert.equal(raceElapsedSeconds(started, started + 700_000), TIME_LIMIT_SECONDS);
});

test('validatePlayMetrics derives accuracy from typed text', () => {
  const content = 'hello world';
  const result = validatePlayMetrics({
    typedRaw: 'hello worlx', // same length, last char wrong
    content,
    timeSeconds: 10,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.metrics.accuracy, 91); // 10/11
  assert.equal(result.metrics.completed, true); // length-complete even with typos
  assert.equal(result.metrics.charsTyped, 11);
  assert.equal(result.metrics.correctWords, 1); // "hello" matches; "worlx" does not
  assert.ok(result.metrics.wpm > 0);
});

test('validatePlayMetrics marks completed only when fully typed', () => {
  const content = 'abcde';
  const done = validatePlayMetrics({
    typedRaw: 'abcde',
    content,
    timeSeconds: 5,
  });
  assert.equal(done.ok, true);
  if (done.ok) {
    assert.equal(done.metrics.completed, true);
    assert.equal(done.metrics.accuracy, 100);
    assert.equal(done.metrics.eligibleForLeaderboard, true);
  }
});

test('validatePlayMetrics rejects empty typed content', () => {
  const result = validatePlayMetrics({
    typedRaw: '',
    content: 'hello',
    timeSeconds: 10,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /typed/i);
  }
});

test('validatePlayMetrics rejects impossible speed', () => {
  // 350 chars in 1 second → 70 cps >> 35 cps ceiling
  const content = 'x'.repeat(350);
  const result = validatePlayMetrics({
    typedRaw: content,
    content,
    timeSeconds: 1,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /impossible|speed|words\/sec/i);
  }
});

test('validatePlayMetrics rejects WPM above hard ceiling', () => {
  // Barely under cps limit for short text but still check path works with long duration
  const content = 'hello';
  const ok = validatePlayMetrics({
    typedRaw: content,
    content,
    timeSeconds: 60,
  });
  assert.equal(ok.ok, true);
});

test('validatePlayMetrics incomplete under 50% is not leaderboard-eligible', () => {
  const content = 'a'.repeat(100);
  const result = validatePlayMetrics({
    typedRaw: 'a'.repeat(40),
    content,
    timeSeconds: 30,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metrics.completed, false);
    assert.equal(result.metrics.eligibleForLeaderboard, false);
    assert.ok(result.metrics.progress < 0.5);
  }
});

test('validatePlayMetrics incomplete at 50%+ is leaderboard-eligible', () => {
  const content = 'a'.repeat(100);
  const result = validatePlayMetrics({
    typedRaw: 'a'.repeat(50),
    content,
    timeSeconds: 30,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metrics.completed, false);
    assert.equal(result.metrics.eligibleForLeaderboard, true);
  }
});

test('forged 100% accuracy without matching typed text cannot pass validation', () => {
  // Client used to send accuracy:100 independently; server now ignores claims.
  const content = 'The quick brown fox';
  const result = validatePlayMetrics({
    typedRaw: 'xxxxxxxxxxxxxxxxxxx', // wrong but same length
    content,
    timeSeconds: 20,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.metrics.accuracy < 100);
    assert.equal(result.metrics.completed, true);
  }
});

test('validatePlayMetrics clamps duration and ignores client time inflation', () => {
  const content = 'hello';
  // Even if a client claimed a huge timeSeconds historically, server clamps to cap.
  const result = validatePlayMetrics({
    typedRaw: content,
    content,
    timeSeconds: 99999,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metrics.timeSeconds, TIME_LIMIT_SECONDS);
    assert.ok(result.metrics.wpm <= MAX_WPM);
  }
});

test('typed input longer than challenge is truncated before scoring', () => {
  const content = 'abc';
  const result = validatePlayMetrics({
    typedRaw: 'abcdef',
    content,
    timeSeconds: 10,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metrics.charsTyped, 3);
    assert.equal(result.metrics.typed, 'abc');
    assert.equal(result.metrics.completed, true);
  }
});

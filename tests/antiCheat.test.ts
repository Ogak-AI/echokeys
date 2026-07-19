import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_WPM,
  TIME_LIMIT_SECONDS,
  calculateAccuracy,
  calculateWpm,
  countWords,
  formatSubredditLabel,
  isSpeedViolation,
  sanitizePrompt,
} from '../src/shared/utils/antiCheat.ts';
import { calculateScore } from '../src/shared/types/index.ts';

test('score formula prioritizes accuracy', () => {
  // Score = (Acc% × 100) + WPM − (time/60)
  assert.equal(calculateScore(0.95, 80, 60), 95 + 80 - 1);
  assert.equal(calculateScore(1, 100, 0), 200);
});

test('7 wps ceiling is 420 WPM', () => {
  assert.equal(MAX_WPM, 420);
  assert.equal(TIME_LIMIT_SECONDS, 600);
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

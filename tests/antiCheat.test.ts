import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MAX_WPM,
  MAX_CHARS_PER_SECOND,
  TIME_LIMIT_SECONDS,
  MIN_LEADERBOARD_CORRECT_WORDS,
  MIN_LEADERBOARD_PROGRESS,
  BOT_INTERVAL_MIN_SAMPLES,
  calculateWpm,
  calculateNetWpm,
  calculateAccuracy,
  countCorrectChars,
  countCorrectWords,
  countWords,
  isSpeedViolation,
  sanitizeTypedInput,
  sanitizeKeyIntervals,
  humanTypingConfidence,
  isBotLikeTyping,
  validatePlayMetrics,
  minDurationSeconds,
  raceElapsedSeconds,
  codePoints,
} from '../src/shared/utils/antiCheat.js';

// ---------------------------------------------------------------------------
// calculateWpm
// ---------------------------------------------------------------------------
describe('calculateWpm', () => {
  it('returns 0 when timeSeconds is zero', () => {
    expect(calculateWpm(300, 0)).toBe(0);
  });

  it('returns 0 when charsTyped is zero', () => {
    expect(calculateWpm(0, 60)).toBe(0);
  });

  it('returns 0 for non-finite inputs', () => {
    expect(calculateWpm(NaN, 60)).toBe(0);
    expect(calculateWpm(300, NaN)).toBe(0);
    expect(calculateWpm(Infinity, 60)).toBe(0);
  });

  it('calculates correctly for normal inputs (300 chars / 60 s = 60 WPM)', () => {
    expect(calculateWpm(300, 60)).toBe(60);
  });

  it('calculates correctly for higher WPM (420 chars / 60 s = 84 WPM)', () => {
    expect(calculateWpm(420, 60)).toBe(84);
  });

  it('stays at or below MAX_WPM boundary for legitimate input', () => {
    // MAX_WPM = 420; just below the ceiling
    const wpm = calculateWpm(MAX_WPM * 5, 60); // 2100 chars / 60s = 420 wpm
    expect(wpm).toBeLessThanOrEqual(MAX_WPM);
  });
});

// ---------------------------------------------------------------------------
// calculateAccuracy
// ---------------------------------------------------------------------------
describe('calculateAccuracy', () => {
  it('returns 100 when typedLength is 0 (nothing typed yet)', () => {
    expect(calculateAccuracy(0, 0)).toBe(100);
  });

  it('returns 100 for all correct', () => {
    expect(calculateAccuracy(50, 50)).toBe(100);
  });

  it('returns 0 for all wrong', () => {
    expect(calculateAccuracy(0, 50)).toBe(0);
  });

  it('clamps values above 100 down to 100', () => {
    // More correctChars than typedLength is physically impossible but code must clamp
    expect(calculateAccuracy(60, 50)).toBe(100);
  });

  it('returns 0 for non-finite correctChars', () => {
    expect(calculateAccuracy(NaN, 10)).toBe(0);
    expect(calculateAccuracy(Infinity, 10)).toBe(0);
  });

  it('returns 0 for non-finite typedLength', () => {
    expect(calculateAccuracy(5, NaN)).toBe(0);
    expect(calculateAccuracy(5, Infinity)).toBe(0);
  });

  it('returns 0 for negative correctChars (clamped)', () => {
    expect(calculateAccuracy(-5, 10)).toBe(0);
  });

  it('calculates 95% correctly', () => {
    expect(calculateAccuracy(95, 100)).toBe(95);
  });
});

// ---------------------------------------------------------------------------
// countCorrectChars
// ---------------------------------------------------------------------------
describe('countCorrectChars', () => {
  it('returns 0 for empty typed string', () => {
    expect(countCorrectChars('', 'hello')).toBe(0);
  });

  it('returns 0 for empty target string', () => {
    expect(countCorrectChars('hello', '')).toBe(0);
  });

  it('returns 0 for both empty strings', () => {
    expect(countCorrectChars('', '')).toBe(0);
  });

  it('counts exact match correctly', () => {
    expect(countCorrectChars('hello', 'hello')).toBe(5);
  });

  it('counts all wrong characters', () => {
    expect(countCorrectChars('xxxxx', 'hello')).toBe(0);
  });

  it('handles emoji / unicode (code-point aware)', () => {
    // 'hi👍x' has 4 code points: h, i, 👍, x
    expect(countCorrectChars('hi👍x', 'hi👍x')).toBe(4);
    // different emoji in same position
    expect(countCorrectChars('hi👎x', 'hi👍x')).toBe(3);
  });

  it('does not split surrogate pairs (emoji counts as one unit)', () => {
    const points = codePoints('hi👍x');
    expect(points.length).toBe(4);
  });

  it('counts partial match (first 4 of 5 correct)', () => {
    expect(countCorrectChars('helxo', 'hello')).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// countCorrectWords
// ---------------------------------------------------------------------------
describe('countCorrectWords', () => {
  it('returns 0 when typed is empty', () => {
    expect(countCorrectWords('', 'hello world')).toBe(0);
  });

  it('returns 0 when target is empty', () => {
    expect(countCorrectWords('hello world', '')).toBe(0);
  });

  it('matches words at correct positions', () => {
    expect(countCorrectWords('hello world foo', 'hello world bar')).toBe(2);
  });

  it('handles partial completion (fewer typed words than target)', () => {
    expect(countCorrectWords('hello wrong', 'hello world')).toBe(1);
  });

  it('handles unicode / emoji words', () => {
    expect(countCorrectWords('hi 👍 ok', 'hi 👍 ok')).toBe(3);
    expect(countCorrectWords('hi 👎 ok', 'hi 👍 ok')).toBe(2);
  });

  it('returns 0 when no words match', () => {
    expect(countCorrectWords('aaa bbb', 'ccc ddd')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isSpeedViolation
// ---------------------------------------------------------------------------
describe('isSpeedViolation', () => {
  it('returns false when charsDelta is zero', () => {
    expect(isSpeedViolation(0, 1000)).toBe(false);
  });

  it('returns true when msDelta is zero (division by zero → instant)', () => {
    expect(isSpeedViolation(10, 0)).toBe(true);
  });

  it('returns false just at the boundary (35 chars/sec)', () => {
    // 35 chars in 1000 ms = exactly 35 cps — not a violation
    expect(isSpeedViolation(35, 1000)).toBe(false);
  });

  it('returns true one char above the boundary (36 chars/sec)', () => {
    expect(isSpeedViolation(36, 1000)).toBe(true);
  });

  it('returns false for normal human typing', () => {
    // ~80 WPM ≈ 6.7 chars/sec
    expect(isSpeedViolation(7, 1000)).toBe(false);
  });

  it('returns false for negative charsDelta', () => {
    expect(isSpeedViolation(-5, 1000)).toBe(false);
  });

  it('boundary: MAX_CHARS_PER_SECOND is 35', () => {
    expect(MAX_CHARS_PER_SECOND).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// sanitizeTypedInput
// ---------------------------------------------------------------------------
describe('sanitizeTypedInput', () => {
  it('strips control characters (U+0000–U+0008)', () => {
    expect(sanitizeTypedInput('ab\u0000cd', 10)).toBe('abcd');
  });

  it('strips DEL character (U+007F)', () => {
    expect(sanitizeTypedInput('ab\u007Fcd', 10)).toBe('abcd');
  });

  it('caps output to contentLength', () => {
    expect(sanitizeTypedInput('abcdef', 3)).toBe('abc');
  });

  it('returns empty string when contentLength is 0', () => {
    expect(sanitizeTypedInput('hello', 0)).toBe('');
  });

  it('returns empty string when input is not a string', () => {
    // @ts-expect-error testing runtime path
    expect(sanitizeTypedInput(null, 10)).toBe('');
  });

  it('passes through normal unicode and emoji', () => {
    expect(sanitizeTypedInput('hello 👍 world', 20)).toBe('hello 👍 world');
  });

  it('preserves tab and newline (not stripped)', () => {
    expect(sanitizeTypedInput('a\tb\nc', 10)).toBe('a\tb\nc');
  });
});

// ---------------------------------------------------------------------------
// sanitizeKeyIntervals
// ---------------------------------------------------------------------------
describe('sanitizeKeyIntervals', () => {
  it('returns empty array for non-array input', () => {
    expect(sanitizeKeyIntervals(null)).toEqual([]);
    expect(sanitizeKeyIntervals('hello')).toEqual([]);
    expect(sanitizeKeyIntervals(42)).toEqual([]);
  });

  it('drops non-finite values', () => {
    expect(sanitizeKeyIntervals([NaN, Infinity, -Infinity, 100])).toEqual([100]);
  });

  it('drops zero and negative values', () => {
    expect(sanitizeKeyIntervals([0, -1, 50])).toEqual([50]);
  });

  it('drops values at or above 5000', () => {
    expect(sanitizeKeyIntervals([4999, 5000, 100])).toEqual([4999, 100]);
  });

  it('caps at 64 samples by default', () => {
    const many = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(sanitizeKeyIntervals(many).length).toBe(64);
  });

  it('respects custom maxSamples cap', () => {
    const many = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(sanitizeKeyIntervals(many, 8).length).toBe(8);
  });

  it('converts numeric strings to numbers', () => {
    // The code does Number(item), so '12' → 12
    expect(sanitizeKeyIntervals(['12', '100'])).toEqual([12, 100]);
  });

  it('rounds values to integers', () => {
    expect(sanitizeKeyIntervals([10.7])).toEqual([11]);
  });
});

// ---------------------------------------------------------------------------
// humanTypingConfidence
// ---------------------------------------------------------------------------
describe('humanTypingConfidence', () => {
  it('returns 0.5 (insufficient evidence) for fewer than 8 samples', () => {
    expect(humanTypingConfidence([50, 60, 70])).toBe(0.5);
    expect(humanTypingConfidence([])).toBe(0.5);
  });

  it('returns a low score for metronomic bot intervals (CV < 0.05)', () => {
    const bot = Array.from({ length: 32 }, () => 50);
    expect(humanTypingConfidence(bot)).toBeLessThan(0.3);
  });

  it('returns a high score for human-like variance (CV ~0.15–0.6)', () => {
    const human = [72, 91, 68, 105, 77, 88, 95, 70, 110, 82, 76, 99, 85, 73, 101, 90, 79, 94, 86, 71];
    expect(humanTypingConfidence(human)).toBeGreaterThanOrEqual(0.5);
  });

  it('returns a value in [0, 1]', () => {
    const samples = Array.from({ length: 20 }, (_, i) => 50 + (i % 5) * 10);
    const conf = humanTypingConfidence(samples);
    expect(conf).toBeGreaterThanOrEqual(0);
    expect(conf).toBeLessThanOrEqual(1);
  });

  it('filters out non-positive and ≥5000 values before calculating', () => {
    // With only 3 valid values (less than 8) → fallback 0.5
    const mixed = [0, -1, 50, 60, 70, 6000];
    expect(humanTypingConfidence(mixed)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// isBotLikeTyping
// ---------------------------------------------------------------------------
describe('isBotLikeTyping', () => {
  it('returns false when below minimum sample count', () => {
    const few = [50, 50, 50];
    expect(isBotLikeTyping(few)).toBe(false);
  });

  it('BOT_INTERVAL_MIN_SAMPLES is 16', () => {
    expect(BOT_INTERVAL_MIN_SAMPLES).toBe(16);
  });

  it('returns true for metronomic bot-like typing', () => {
    const bot = Array.from({ length: 32 }, () => 50);
    expect(isBotLikeTyping(bot)).toBe(true);
  });

  it('returns false for human-like typing variance', () => {
    const human = [72, 91, 68, 105, 77, 88, 95, 70, 110, 82, 76, 99, 85, 73, 101, 90, 79, 94, 86, 71];
    expect(isBotLikeTyping(human)).toBe(false);
  });

  it('sanitizes intervals before computing (ignores junk values)', () => {
    // Pad with just enough valid bot-like values but many invalid ones
    const mixed: unknown[] = Array.from({ length: 32 }, () => 50);
    mixed.push(null, undefined, NaN, -1, 0);
    expect(isBotLikeTyping(mixed as number[])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePlayMetrics
// ---------------------------------------------------------------------------
describe('validatePlayMetrics', () => {
  it('rejects impossible typing speed', () => {
    // 350 chars in 1 second → 70 cps >> 35 cps ceiling
    const content = 'x'.repeat(350);
    const result = validatePlayMetrics({ typedRaw: content, content, timeSeconds: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/impossible|speed/i);
  });

  it('accepts a valid race', () => {
    const content = 'hello world foo bar baz';
    const result = validatePlayMetrics({ typedRaw: content, content, timeSeconds: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.accuracy).toBe(100);
      expect(result.metrics.correctWords).toBe(5);
    }
  });

  it('rejects empty typed input', () => {
    const result = validatePlayMetrics({ typedRaw: '', content: 'hello', timeSeconds: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/typed/i);
  });

  it('rejects zero timeSeconds', () => {
    const result = validatePlayMetrics({ typedRaw: 'hello', content: 'hello', timeSeconds: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects missing challenge content', () => {
    const result = validatePlayMetrics({ typedRaw: 'hello', content: '', timeSeconds: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/content/i);
  });

  it('marks exact completion as completed=true', () => {
    const content = 'abcde';
    const result = validatePlayMetrics({ typedRaw: content, content, timeSeconds: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.completed).toBe(true);
      expect(result.metrics.eligibleForLeaderboard).toBe(true);
    }
  });

  it('clamps timeSeconds to TIME_LIMIT_SECONDS', () => {
    const content = 'hello';
    const result = validatePlayMetrics({ typedRaw: content, content, timeSeconds: 99999 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.metrics.timeSeconds).toBe(TIME_LIMIT_SECONDS);
  });

  it('truncates typed input longer than content before scoring', () => {
    const content = 'abc';
    const result = validatePlayMetrics({ typedRaw: 'abcdef', content, timeSeconds: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.charsTyped).toBe(3);
      expect(result.metrics.typed).toBe('abc');
    }
  });

  it('is not eligible when correctWords < floor and progress < 50%', () => {
    const content = 'a'.repeat(100);
    const result = validatePlayMetrics({ typedRaw: 'a'.repeat(40), content, timeSeconds: 30 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.eligibleForLeaderboard).toBe(false);
      expect(result.metrics.correctWords).toBe(0);
    }
  });

  it('is eligible when correctWords >= MIN_LEADERBOARD_CORRECT_WORDS even under 50%', () => {
    const targetWords = Array.from({ length: 100 }, (_, i) => `w${i}`);
    const content = targetWords.join(' ');
    const typed = targetWords.slice(0, MIN_LEADERBOARD_CORRECT_WORDS).join(' ') + ' ';
    const result = validatePlayMetrics({ typedRaw: typed, content, timeSeconds: 40 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.eligibleForLeaderboard).toBe(true);
      expect(result.metrics.correctWords).toBeGreaterThanOrEqual(MIN_LEADERBOARD_CORRECT_WORDS);
    }
  });

  it('is not eligible at 50%+ progress when correctWords is 0', () => {
    const content = 'a'.repeat(100);
    const result = validatePlayMetrics({ typedRaw: 'b'.repeat(50), content, timeSeconds: 30 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.eligibleForLeaderboard).toBe(false);
      expect(result.metrics.correctWords).toBe(0);
      expect(result.metrics.progress).toBeGreaterThanOrEqual(MIN_LEADERBOARD_PROGRESS);
    }
  });

  it('scores final buffer after simulated backspaces (only final typed matters)', () => {
    // User typed wrong then corrected — server only sees final buffer.
    const content = 'the quick brown fox';
    const typed = 'the quick brown fox';
    const result = validatePlayMetrics({ typedRaw: typed, content, timeSeconds: 25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.accuracy).toBe(100);
      expect(result.metrics.correctWords).toBe(4);
      expect(result.metrics.wpm).toBe(calculateWpm(codePoints(typed).length, 25));
    }
  });

  it('handles emoji in content and typed (code-point metrics)', () => {
    const content = 'go 👍 team';
    const result = validatePlayMetrics({ typedRaw: content, content, timeSeconds: 8 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.charsTyped).toBe(codePoints(content).length);
      expect(result.metrics.correctChars).toBe(codePoints(content).length);
      expect(result.metrics.correctWords).toBe(3);
    }
  });

  it('accepts slow typing well under the speed ceiling', () => {
    const content = 'slow and steady wins the race today';
    // ~5 chars/sec is far under 35 cps max
    const result = validatePlayMetrics({ typedRaw: content, content, timeSeconds: 40 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.wpm).toBeLessThan(MAX_WPM);
      expect(result.metrics.accuracy).toBe(100);
    }
  });

  it('strips control characters from typed input', () => {
    const content = 'hello';
    const result = validatePlayMetrics({
      typedRaw: 'he\u0000llo',
      content,
      timeSeconds: 10,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.typed).toBe('hello');
      expect(result.metrics.accuracy).toBe(100);
    }
  });
});

// ---------------------------------------------------------------------------
// minDurationSeconds
// ---------------------------------------------------------------------------
describe('minDurationSeconds', () => {
  it('returns 0 for zero chars', () => {
    expect(minDurationSeconds(0)).toBe(0);
  });

  it('returns 0 for negative chars', () => {
    expect(minDurationSeconds(-5)).toBe(0);
  });

  it('returns 1 for exactly 35 chars (ceiling speed)', () => {
    expect(minDurationSeconds(35)).toBe(1);
  });

  it('returns 2 for 70 chars', () => {
    expect(minDurationSeconds(70)).toBe(2);
  });

  it('returns a proportional value for arbitrary chars', () => {
    // 17.5 chars → 0.5s
    expect(minDurationSeconds(17.5)).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// raceElapsedSeconds
// ---------------------------------------------------------------------------
describe('raceElapsedSeconds', () => {
  it('calculates elapsed seconds correctly', () => {
    const now = Date.now();
    expect(raceElapsedSeconds(now - 5000, now)).toBe(5);
  });

  it('clamps to TIME_LIMIT_SECONDS when elapsed exceeds cap', () => {
    const now = Date.now();
    const startedAt = now - (TIME_LIMIT_SECONDS + 100) * 1000;
    expect(raceElapsedSeconds(startedAt, now)).toBe(TIME_LIMIT_SECONDS);
  });

  it('returns TIME_LIMIT_SECONDS for invalid startedAt (0)', () => {
    expect(raceElapsedSeconds(0)).toBe(TIME_LIMIT_SECONDS);
  });

  it('returns TIME_LIMIT_SECONDS for negative startedAt', () => {
    expect(raceElapsedSeconds(-9999)).toBe(TIME_LIMIT_SECONDS);
  });

  it('returns TIME_LIMIT_SECONDS for NaN startedAt', () => {
    expect(raceElapsedSeconds(NaN)).toBe(TIME_LIMIT_SECONDS);
  });

  it('floors partial seconds', () => {
    const now = Date.now();
    // 5.9s elapsed → 5 (Math.floor)
    expect(raceElapsedSeconds(now - 5900, now)).toBe(5);
  });
});

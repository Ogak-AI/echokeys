import { describe, it, expect } from 'vitest';
import {
  MIN_RACE_WORDS,
  MAX_SOURCE_CHARS,
  findSentenceStarts,
  sliceFromSentence,
  extractRaceExcerpt,
  sanitizeSourceText,
} from '../src/shared/utils/raceExcerpt.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a multi-sentence corpus of at least `words` words. */
function makeCorpus(words: number, sentences = 40): string {
  const perSentence = Math.ceil(words / sentences);
  const parts: string[] = [];
  for (let s = 0; s < sentences; s++) {
    const toks: string[] = [];
    for (let w = 0; w < perSentence; w++) {
      toks.push(`w${s}_${w}`);
    }
    parts.push(`${toks.join(' ')}.`);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// findSentenceStarts
// ---------------------------------------------------------------------------
describe('findSentenceStarts', () => {
  it('returns empty array for empty string', () => {
    expect(findSentenceStarts('')).toEqual([]);
  });

  it('returns single start [0] for a single sentence without terminator', () => {
    const starts = findSentenceStarts('Hello world');
    expect(starts).toHaveLength(1);
    expect(starts[0]).toBe(0);
  });

  it('finds starts after . ! ?', () => {
    const text = 'First sentence. Second one! Third? Fourth.';
    const starts = findSentenceStarts(text);
    expect(starts.length).toBe(4);
    expect(text.slice(starts[0]!)).toMatch(/^First/);
    expect(text.slice(starts[1]!)).toMatch(/^Second/);
    expect(text.slice(starts[2]!)).toMatch(/^Third/);
    expect(text.slice(starts[3]!)).toMatch(/^Fourth/);
  });

  it('skips leading whitespace for the first start', () => {
    const text = '   Hello world.';
    const starts = findSentenceStarts(text);
    expect(text[starts[0]!]).toBe('H');
  });

  it('handles multiple terminators (e.g. "...")', () => {
    const text = 'Wait... Now go. Done!';
    const starts = findSentenceStarts(text);
    // At minimum: start of "Wait", "Now", "Done"
    expect(starts.length).toBeGreaterThanOrEqual(2);
  });

  it('does not produce duplicate offsets', () => {
    const text = 'One. Two. Three.';
    const starts = findSentenceStarts(text);
    const unique = [...new Set(starts)];
    expect(starts).toEqual(unique);
  });
});

// ---------------------------------------------------------------------------
// sliceFromSentence
// ---------------------------------------------------------------------------
describe('sliceFromSentence', () => {
  it('returns empty content for empty/whitespace remainder', () => {
    const result = sliceFromSentence('   ', 0, 10);
    expect(result.content).toBe('');
    expect(result.wordCount).toBe(0);
  });

  it('uses all available words when source is shorter than minWords', () => {
    const text = 'Alpha beta gamma. Delta epsilon zeta.';
    const result = sliceFromSentence(text, 0, 1000);
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('extends past the word floor to the next sentence terminator', () => {
    const text = 'one two three four five six seven eight nine ten.';
    const result = sliceFromSentence(text, 0, 6);
    expect(result.content).toMatch(/\.$/);
    expect(result.wordCount).toBe(10);
  });

  it('respects startOffset to begin mid-text', () => {
    const text = 'Skip this. Start here please.';
    const start = text.indexOf('Start');
    const result = sliceFromSentence(text, start, 2);
    expect(result.content).toContain('Start');
    expect(result.startOffset).toBe(start);
  });

  it('falls back to full remainder when no terminator after word floor', () => {
    const text = 'one two three four five six seven eight nine ten';
    const result = sliceFromSentence(text, 0, 6);
    // No period — should return full remainder
    expect(result.wordCount).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// extractRaceExcerpt
// ---------------------------------------------------------------------------
describe('extractRaceExcerpt', () => {
  it('throws for empty source', () => {
    expect(() => extractRaceExcerpt('')).toThrow();
    expect(() => extractRaceExcerpt('   ')).toThrow();
  });

  it('is deterministic with an injected random function', () => {
    const source = makeCorpus(MIN_RACE_WORDS + 800, 60);
    const a = extractRaceExcerpt(source, { random: () => 0.9 });
    const b = extractRaceExcerpt(source, { random: () => 0.9 });
    expect(a.content).toBe(b.content);
    expect(a.startOffset).toBe(b.startOffset);
  });

  it('different random values produce different excerpts on large corpus', () => {
    const source = makeCorpus(MIN_RACE_WORDS + 2000, 100);
    const a = extractRaceExcerpt(source, { random: () => 0.1 });
    const b = extractRaceExcerpt(source, { random: () => 0.9 });
    // Unlikely to be identical with distinct random values
    expect(a.startOffset).not.toBe(b.startOffset);
  });

  it('respects minWords option (custom lower value)', () => {
    const source = makeCorpus(200, 20);
    const result = extractRaceExcerpt(source, { minWords: 50, random: () => 0 });
    expect(result.wordCount).toBeGreaterThanOrEqual(50);
  });

  it('excerpt is a contiguous slice of source', () => {
    const source = makeCorpus(MIN_RACE_WORDS + 500, 50);
    const result = extractRaceExcerpt(source, { random: () => 0 });
    expect(source).toContain(result.content);
  });

  it('excerpt ends on a sentence terminator when source has terminators', () => {
    const source = makeCorpus(MIN_RACE_WORDS + 500, 50);
    const result = extractRaceExcerpt(source, { random: () => 0 });
    expect(result.content).toMatch(/[.!?]$/);
  });

  it('returns a result even for short source (under minWords)', () => {
    const short = 'Short sentence. Another one. And a third.';
    const result = extractRaceExcerpt(short, { minWords: 2000, random: () => 0 });
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('wordCount matches actual words in content', () => {
    const source = makeCorpus(MIN_RACE_WORDS + 500, 50);
    const result = extractRaceExcerpt(source, { random: () => 0.3 });
    // Count words independently
    const counted = result.content.split(/\s+/).filter(Boolean).length;
    expect(result.wordCount).toBe(counted);
  });
});

// ---------------------------------------------------------------------------
// sanitizeSourceText
// ---------------------------------------------------------------------------
describe('sanitizeSourceText', () => {
  it('strips control characters (U+0000–U+0008)', () => {
    expect(sanitizeSourceText('hello\u0000world')).toBe('helloworld');
  });

  it('strips U+007F DEL', () => {
    expect(sanitizeSourceText('ab\u007Fcd')).toBe('abcd');
  });

  it('normalizes CRLF to LF', () => {
    expect(sanitizeSourceText('line1\r\nline2')).toBe('line1\nline2');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeSourceText('  hello world  ')).toBe('hello world');
  });

  it('caps at MAX_SOURCE_CHARS (200,000) by default', () => {
    const long = 'x'.repeat(300_000);
    expect(sanitizeSourceText(long).length).toBe(MAX_SOURCE_CHARS);
  });

  it('respects a custom maxLen parameter', () => {
    const text = 'abcdefghij';
    expect(sanitizeSourceText(text, 5)).toBe('abcde');
  });

  it('passes through normal unicode and emoji', () => {
    expect(sanitizeSourceText('hello 👍 world')).toBe('hello 👍 world');
  });

  it('preserves newlines (LF) inside text', () => {
    const text = 'line1\nline2\nline3';
    expect(sanitizeSourceText(text)).toContain('\n');
  });
});

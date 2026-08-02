import { describe, it, expect } from 'vitest';
import { detectContentDomain } from '../src/shared/utils/contentDomain.js';
import { countWords } from '../src/shared/utils/antiCheat.js';
import {
  MIN_RACE_WORDS,
  endAtLastCompleteSentence,
  extractRaceExcerpt,
  findSentenceStarts,
  sanitizeSourceText,
  sliceFromSentence,
} from '../src/shared/utils/raceExcerpt.js';

describe('detectContentDomain', () => {
  it('labels code domain', () => {
    expect(detectContentDomain('Write a recursive binary search in Rust')).toBe('code');
  });
  it('labels legal domain', () => {
    expect(detectContentDomain('Draft a sales contract with a liability clause')).toBe('legal');
  });
  it('labels marketing domain', () => {
    expect(detectContentDomain('Create a marketing pitch for productivity app')).toBe('marketing');
  });
  it('labels technical domain', () => {
    expect(detectContentDomain('Explain system architecture technical guide')).toBe('technical');
  });
  it('labels creative domain', () => {
    expect(detectContentDomain('Write a creative story opening')).toBe('creative');
  });
  it('labels prose domain', () => {
    expect(detectContentDomain('Random daily journal entry about typing')).toBe('prose');
  });
});

describe('findSentenceStarts', () => {
  it('locates beginnings after . ! ?', () => {
    const text = 'First sentence. Second one! Third? Fourth remains.';
    const starts = findSentenceStarts(text);
    expect(starts.length).toBe(4);
    expect(text.slice(starts[0]!)).toMatch(/^First/);
    expect(text.slice(starts[1]!)).toMatch(/^Second/);
    expect(text.slice(starts[2]!)).toMatch(/^Third/);
    expect(text.slice(starts[3]!)).toMatch(/^Fourth/);
  });
});

describe('endAtLastCompleteSentence', () => {
  it('trims trailing fragment', () => {
    expect(endAtLastCompleteSentence('Done. Almost done without period')).toBe('Done.');
    expect(endAtLastCompleteSentence('Only one.')).toBe('Only one.');
  });
});

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

describe('extractRaceExcerpt', () => {
  it('takes at least MIN_RACE_WORDS and ends on a sentence', () => {
    const source = makeCorpus(MIN_RACE_WORDS + 500, 50);
    const excerpt = extractRaceExcerpt(source, { random: () => 0 });
    expect(excerpt.wordCount).toBeGreaterThanOrEqual(MIN_RACE_WORDS);
    expect(excerpt.content).toMatch(/[.!?]$/);
    expect(source).toContain(excerpt.content);
  });

  it('random start is deterministic with injected RNG', () => {
    const source = makeCorpus(MIN_RACE_WORDS + 800, 60);
    const a = extractRaceExcerpt(source, { random: () => 0.9 });
    const b = extractRaceExcerpt(source, { random: () => 0.9 });
    expect(a.content).toBe(b.content);
    expect(a.startOffset).toBe(b.startOffset);
  });
});

describe('sliceFromSentence', () => {
  it('extends past word floor to sentence end', () => {
    const text = 'one two three four five six seven eight nine ten.';
    const excerpt = sliceFromSentence(text, 0, 6);
    expect(excerpt.content).toBe(text.trim());
    expect(excerpt.wordCount).toBe(10);
    expect(excerpt.content).toMatch(/\.$/);
  });
});

describe('short source', () => {
  it('uses available complete sentences', () => {
    const short = 'Alpha beta gamma. Delta epsilon zeta. Eta theta iota.';
    const excerpt = extractRaceExcerpt(short, { minWords: 2000, random: () => 0 });
    expect(excerpt.wordCount).toBeGreaterThan(0);
    expect(excerpt.content).toMatch(/[.!?]$/);
    expect(short.includes(excerpt.content) || excerpt.content === short).toBe(true);
  });
});

describe('sanitizeSourceText', () => {
  it('strips controls and caps length', () => {
    expect(sanitizeSourceText('  hello\u0000world  ')).toBe('helloworld');
    expect(sanitizeSourceText('x'.repeat(300_000)).length).toBe(200_000);
  });
});

describe('countWords', () => {
  it('matches raceExcerpt expectations', () => {
    expect(countWords('a b  c')).toBe(3);
    expect(countWords(makeCorpus(100, 5))).toBe(100);
  });
});

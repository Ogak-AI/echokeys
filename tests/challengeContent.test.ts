import test from 'node:test';
import assert from 'node:assert/strict';
import { detectContentDomain } from '../src/shared/utils/contentDomain.ts';
import { countWords } from '../src/shared/utils/antiCheat.ts';
import {
  MIN_RACE_WORDS,
  endAtLastCompleteSentence,
  extractRaceExcerpt,
  findSentenceStarts,
  sanitizeSourceText,
  sliceFromSentence,
} from '../src/shared/utils/raceExcerpt.ts';

test('detectContentDomain labels challenge text by domain', () => {
  assert.equal(detectContentDomain('Write a recursive binary search in Rust'), 'code');
  assert.equal(detectContentDomain('Draft a sales contract with a liability clause'), 'legal');
  assert.equal(detectContentDomain('Create a marketing pitch for productivity app'), 'marketing');
  assert.equal(detectContentDomain('Explain system architecture technical guide'), 'technical');
  assert.equal(detectContentDomain('Write a creative story opening'), 'creative');
  assert.equal(detectContentDomain('Random daily journal entry about typing'), 'prose');
});

test('findSentenceStarts locates beginnings after . ! ?', () => {
  const text = 'First sentence. Second one! Third? Fourth remains.';
  const starts = findSentenceStarts(text);
  assert.equal(starts.length, 4);
  assert.equal(text.slice(starts[0]!).startsWith('First'), true);
  assert.equal(text.slice(starts[1]!).startsWith('Second'), true);
  assert.equal(text.slice(starts[2]!).startsWith('Third'), true);
  assert.equal(text.slice(starts[3]!).startsWith('Fourth'), true);
});

test('endAtLastCompleteSentence trims trailing fragment', () => {
  assert.equal(
    endAtLastCompleteSentence('Done. Almost done without period'),
    'Done.'
  );
  assert.equal(endAtLastCompleteSentence('Only one.'), 'Only one.');
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

test('extractRaceExcerpt takes at least MIN_RACE_WORDS and ends on a sentence', () => {
  const source = makeCorpus(MIN_RACE_WORDS + 500, 50);
  const excerpt = extractRaceExcerpt(source, { random: () => 0 });

  assert.ok(excerpt.wordCount >= MIN_RACE_WORDS, `got ${excerpt.wordCount} words`);
  assert.match(excerpt.content, /[.!?]$/);
  // Contiguous slice of source
  assert.ok(source.includes(excerpt.content));
});

test('extractRaceExcerpt random start is deterministic with injected RNG', () => {
  const source = makeCorpus(MIN_RACE_WORDS + 800, 60);
  const a = extractRaceExcerpt(source, { random: () => 0.9 });
  const b = extractRaceExcerpt(source, { random: () => 0.9 });
  assert.equal(a.content, b.content);
  assert.equal(a.startOffset, b.startOffset);
});

test('sliceFromSentence extends past word floor to sentence end', () => {
  // 5 words then more until period
  const text = 'one two three four five six seven eight nine ten.';
  const excerpt = sliceFromSentence(text, 0, 6);
  assert.equal(excerpt.content, text);
  assert.equal(excerpt.wordCount, 10);
  assert.match(excerpt.content, /\.$/);
});

test('short source uses available complete sentences', () => {
  const short = 'Alpha beta gamma. Delta epsilon zeta. Eta theta iota.';
  const excerpt = extractRaceExcerpt(short, { minWords: 2000, random: () => 0 });
  assert.ok(excerpt.wordCount > 0);
  assert.match(excerpt.content, /[.!?]$/);
  assert.ok(short.includes(excerpt.content) || excerpt.content === short);
});

test('sanitizeSourceText strips controls and caps length', () => {
  assert.equal(sanitizeSourceText('  hello\u0000world  '), 'helloworld');
  assert.equal(sanitizeSourceText('x'.repeat(300_000)).length, 200_000);
});

test('countWords matches raceExcerpt expectations', () => {
  assert.equal(countWords('a b  c'), 3);
  assert.equal(countWords(makeCorpus(100, 5)), 100);
});

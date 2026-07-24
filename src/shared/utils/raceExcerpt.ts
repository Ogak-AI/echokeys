/**
 * Build a race excerpt from the built-in source pool.
 *
 * Flow:
 * 1. Find sentence starts in the source
 * 2. Pick one at random (prefer starts that leave enough words)
 * 3. Take at least MIN_RACE_WORDS words from that point
 * 4. Extend to the next complete sentence ending
 *
 * No AI — excerpt is a contiguous slice of the source pool only.
 * Players never paste text; they only type what was randomly selected.
 */

import { countWords } from './antiCheat.js';

/** Target length for a race (words). Excerpt is this many or more, ending on a sentence. */
export const MIN_RACE_WORDS = 2000;

/** Max characters accepted for the built-in source pool. */
export const MAX_SOURCE_CHARS = 200_000;

/** Minimum source length (words) before we can build a full race. */
export const MIN_SOURCE_WORDS = MIN_RACE_WORDS;

export type RaceExcerpt = {
  /** Text players type (contiguous slice of source). */
  content: string;
  wordCount: number;
  /** Character offset into the sanitized source where the excerpt begins. */
  startOffset: number;
};

/**
 * Sentence terminators: . ! ? optionally followed by closing quotes/brackets,
 * then whitespace or end of string.
 */
const SENTENCE_END_RE = /[.!?]+["')\]]*(?=\s|$)/g;

/** Find character offsets where sentences begin (first non-whitespace of each). */
export function findSentenceStarts(text: string): number[] {
  const starts: number[] = [];
  if (!text) return starts;

  let i = 0;
  while (i < text.length && /\s/.test(text[i]!)) i++;
  if (i < text.length) starts.push(i);

  SENTENCE_END_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_END_RE.exec(text)) !== null) {
    let next = m.index + m[0].length;
    while (next < text.length && /\s/.test(text[next]!)) next++;
    if (next < text.length && starts[starts.length - 1] !== next) {
      starts.push(next);
    }
  }

  return starts;
}

/** Slice text through the last complete sentence ending, if any. */
export function endAtLastCompleteSentence(text: string): string {
  SENTENCE_END_RE.lastIndex = 0;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_END_RE.exec(text)) !== null) {
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd > 0) return text.slice(0, lastEnd).trim();
  return text.trim();
}

/**
 * Character index just after the Nth whitespace-separated word (1-based N).
 * Returns text.length if there are fewer than N words.
 */
function endOffsetAfterWord(text: string, wordNumber: number): number {
  if (wordNumber <= 0) return 0;
  const re = /\S+/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    count++;
    if (count >= wordNumber) {
      return m.index + m[0].length;
    }
  }
  return text.length;
}

/**
 * From a start position, take at least `minWords` words, then extend to the
 * next sentence-ending punctuation. Falls back to last complete sentence or
 * full remainder if the source runs out.
 */
export function sliceFromSentence(
  text: string,
  startOffset: number,
  minWords: number
): RaceExcerpt {
  const fromStart = text.slice(startOffset);
  if (!fromStart.trim()) {
    return { content: '', wordCount: 0, startOffset };
  }

  const available = countWords(fromStart);
  if (available <= minWords) {
    const content = endAtLastCompleteSentence(fromStart) || fromStart.trim();
    return {
      content,
      wordCount: countWords(content),
      startOffset,
    };
  }

  const minPos = endOffsetAfterWord(fromStart, minWords);
  const afterMin = fromStart.slice(minPos);

  SENTENCE_END_RE.lastIndex = 0;
  const endMatch = SENTENCE_END_RE.exec(afterMin);

  let endPos: number;
  if (endMatch) {
    endPos = minPos + endMatch.index + endMatch[0].length;
  } else {
    // No terminator after the word floor — use remainder (already has minWords).
    endPos = fromStart.length;
  }

  const content = fromStart.slice(0, endPos).trim();
  return {
    content,
    wordCount: countWords(content),
    startOffset,
  };
}

export type ExtractRaceExcerptOptions = {
  minWords?: number;
  /** Injected RNG in [0, 1) for tests. */
  random?: () => number;
};

/**
 * Randomly pick a sentence start in `source`, then take ≥ minWords ending on
 * a complete sentence. Prefer starts that leave at least minWords remaining.
 */
export function extractRaceExcerpt(
  source: string,
  options: ExtractRaceExcerptOptions = {}
): RaceExcerpt {
  const minWords = options.minWords ?? MIN_RACE_WORDS;
  const random = options.random ?? Math.random;

  const text = source.replace(/\r\n/g, '\n').trim();
  if (!text) {
    throw new Error('Source text is empty');
  }

  const starts = findSentenceStarts(text);
  if (starts.length === 0) {
    const content = text.trim();
    return { content, wordCount: countWords(content), startOffset: 0 };
  }

  const totalWords = countWords(text);
  let candidates = starts;

  if (totalWords >= minWords) {
    const withRoom = starts.filter((start) => countWords(text.slice(start)) >= minWords);
    if (withRoom.length > 0) candidates = withRoom;
  }

  const pick = Math.min(
    candidates.length - 1,
    Math.max(0, Math.floor(random() * candidates.length))
  );
  const startOffset = candidates[pick]!;

  return sliceFromSentence(text, startOffset, minWords);
}

/**
 * Sanitize source-pool text (control chars stripped, length capped).
 * Does not rewrite wording.
 */
export function sanitizeSourceText(raw: string, maxLen = MAX_SOURCE_CHARS): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLen);
}

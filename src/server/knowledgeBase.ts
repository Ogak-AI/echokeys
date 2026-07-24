/**
 * Built-in source pool for all races (content/knowledge-base.txt, inlined at build).
 * Players only race random excerpts from this pool.
 */

import raw from '../../content/knowledge-base.txt?raw';
import { countWords } from '../shared/utils/antiCheat.js';
import { MIN_SOURCE_WORDS, sanitizeSourceText } from '../shared/utils/raceExcerpt.js';

const RAW_FILE = String(raw ?? '');

/** Drop optional scaffold header from older template files. */
function stripScaffold(text: string): string {
  const marker = /^-{3,}\s*delete everything above this line when you paste\s*-{3,}\s*$/im;
  const m = marker.exec(text);
  if (m && m.index != null) {
    return text.slice(m.index + m[0].length).trim();
  }
  if (/^PASTE YOUR KNOWLEDGE BASE/i.test(text.trim())) {
    return '';
  }
  return text.trim();
}

export function getKnowledgeBaseSource():
  | { ok: true; source: string; wordCount: number }
  | { ok: false; error: string } {
  const stripped = stripScaffold(RAW_FILE);
  const source = sanitizeSourceText(stripped);
  const wordCount = countWords(source);

  if (wordCount < MIN_SOURCE_WORDS) {
    return {
      ok: false,
      error:
        wordCount === 0
          ? `Source pool is empty. Add at least ${MIN_SOURCE_WORDS.toLocaleString()} words to content/knowledge-base.txt, then rebuild.`
          : `Source pool has ${wordCount.toLocaleString()} words; need at least ${MIN_SOURCE_WORDS.toLocaleString()}. Edit content/knowledge-base.txt and rebuild.`,
    };
  }

  return { ok: true, source, wordCount };
}

export function knowledgeBaseWordCount(): number {
  const result = getKnowledgeBaseSource();
  return result.ok ? result.wordCount : 0;
}

/**
 * Built-in knowledge base (source pool for all races).
 *
 * Maintainers put source text in: content/knowledge-base.txt
 * It is inlined into the server bundle at build time.
 * Players never paste — they only race random excerpts from this pool.
 */

import raw from '../../content/knowledge-base.txt?raw';
import { countWords } from '../shared/utils/antiCheat.js';
import { MIN_SOURCE_WORDS, sanitizeSourceText } from '../shared/utils/raceExcerpt.js';

/** Raw file contents (may include the placeholder header until replaced). */
const RAW_FILE = String(raw ?? '');

/**
 * Strip the scaffold header if the user left it in place.
 * Looks for a line of only dashes/equals after the instructions.
 */
function stripScaffold(text: string): string {
  const marker = /^-{3,}\s*delete everything above this line when you paste\s*-{3,}\s*$/im;
  const m = marker.exec(text);
  if (m && m.index != null) {
    return text.slice(m.index + m[0].length).trim();
  }
  // If they replaced the whole file, use as-is.
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
          ? `Knowledge base is empty. Paste at least ${MIN_SOURCE_WORDS.toLocaleString()} words into content/knowledge-base.txt, then rebuild.`
          : `Knowledge base has ${wordCount.toLocaleString()} words; need at least ${MIN_SOURCE_WORDS.toLocaleString()}. Edit content/knowledge-base.txt and rebuild.`,
    };
  }

  return { ok: true, source, wordCount };
}

export function knowledgeBaseWordCount(): number {
  const result = getKnowledgeBaseSource();
  return result.ok ? result.wordCount : 0;
}

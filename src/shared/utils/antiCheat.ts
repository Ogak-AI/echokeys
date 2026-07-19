/** Product anti-bot limits: 7 words/sec → 1.5s input lock. */
export const MAX_WORDS_PER_SECOND = 7;
export const MAX_WPM = MAX_WORDS_PER_SECOND * 60; // 420
export const THROTTLE_LOCK_MS = 1500;
/** ~5 chars per "word" for WPM/WPS math (standard typing metric). */
export const CHARS_PER_WORD = 5;
export const MAX_CHARS_PER_SECOND = MAX_WORDS_PER_SECOND * CHARS_PER_WORD; // 35
/** Paste / bulk-insert jumps larger than this trigger an immediate lock. */
export const MAX_INPUT_JUMP = 5;
/** 10-minute challenge cap (client + server). */
export const TIME_LIMIT_SECONDS = 600;
/** Allowed WPM drift between client claim and server recalculation. */
export const WPM_TOLERANCE = 8;

/**
 * True when the instantaneous typing rate exceeds 7 words per second.
 * Uses char delta / elapsed ms; ignores empty windows.
 */
export function isSpeedViolation(charsDelta: number, msDelta: number): boolean {
  if (charsDelta <= 0) return false;
  if (msDelta <= 0) return true;
  const charsPerSec = charsDelta / (msDelta / 1000);
  return charsPerSec > MAX_CHARS_PER_SECOND;
}

/** Standard WPM from characters typed and elapsed seconds. */
export function calculateWpm(charsTyped: number, timeSeconds: number): number {
  if (timeSeconds <= 0 || charsTyped <= 0) return 0;
  return Math.round(charsTyped / CHARS_PER_WORD / (timeSeconds / 60));
}

/** Accuracy % (0–100) from correct chars vs typed length. */
export function calculateAccuracy(correctChars: number, typedLength: number): number {
  if (typedLength <= 0) return 100;
  return Math.round((correctChars / typedLength) * 100);
}

/** Count whitespace-separated words in text. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Strip control chars and bound length for user prompts. */
export function sanitizePrompt(raw: string, maxLen = 2000): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

/** Normalize subreddit display/badge label to `r/name`. */
export function formatSubredditLabel(name: string): string {
  const cleaned = name.replace(/^r\//i, '').trim();
  return cleaned ? `r/${cleaned}` : 'r/echokeys';
}

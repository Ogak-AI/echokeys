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
/** Allowed WPM drift between client claim and server recalculation (legacy / display). */
export const WPM_TOLERANCE = 8;
/** Race session TTL — must finish (or time out) within this window. */
export const RACE_TTL_MS = 15 * 60 * 1000;
/**
 * Incomplete runs only rank on the community board if the player typed at least
 * this fraction of the challenge (timeouts near the end still count).
 */
export const MIN_LEADERBOARD_PROGRESS = 0.5;
/** Small grace on theoretical min duration (clock / network jitter). */
export const MIN_TIME_GRACE_SECONDS = 0.75;

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

/** Character-by-character matches against the challenge target. */
export function countCorrectChars(typed: string, target: string): number {
  const len = Math.min(typed.length, target.length);
  let ok = 0;
  for (let i = 0; i < len; i++) {
    if (typed[i] === target[i]) ok++;
  }
  return ok;
}

/**
 * Count fully correct words (token match by position).
 * Leaderboards rank by this primary metric — highest correct words wins.
 */
export function countCorrectWords(typed: string, target: string): number {
  if (!typed || !target) return 0;
  const typedWords = typed.split(/\s+/).filter(Boolean);
  const targetWords = target.split(/\s+/).filter(Boolean);
  const n = Math.min(typedWords.length, targetWords.length);
  let ok = 0;
  for (let i = 0; i < n; i++) {
    if (typedWords[i] === targetWords[i]) ok++;
  }
  return ok;
}

/**
 * Minimum realistic duration for `charsTyped` at the product speed ceiling.
 * Returns 0 when nothing was typed.
 */
export function minDurationSeconds(charsTyped: number): number {
  if (charsTyped <= 0) return 0;
  return charsTyped / MAX_CHARS_PER_SECOND;
}

/** Strip control chars and bound length for user prompts. */
export function sanitizePrompt(raw: string, maxLen = 2000): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Sanitize typed challenge input: strip control chars (keep tab/newline),
 * and never allow more characters than the challenge content.
 */
export function sanitizeTypedInput(raw: string, contentLength: number): string {
  if (typeof raw !== 'string' || contentLength <= 0) return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, contentLength);
}

/** Normalize subreddit display/badge label to `r/name`. */
export function formatSubredditLabel(name: string): string {
  const cleaned = name.replace(/^r\//i, '').trim();
  return cleaned ? `r/${cleaned}` : 'r/echokeys';
}

export type ValidatedPlayMetrics = {
  typed: string;
  charsTyped: number;
  correctChars: number;
  accuracy: number;
  wpm: number;
  timeSeconds: number;
  completed: boolean;
  progress: number;
  wordsTyped: number;
  /** Fully correct word tokens — primary leaderboard metric. */
  correctWords: number;
  eligibleForLeaderboard: boolean;
};

export type ValidatePlayResult =
  | { ok: true; metrics: ValidatedPlayMetrics }
  | { ok: false; error: string };

/**
 * Server-authoritative metrics from typed text + observed duration.
 * Client-claimed WPM / accuracy / completed flags are ignored.
 */
export function validatePlayMetrics(params: {
  typedRaw: string;
  content: string;
  timeSeconds: number;
}): ValidatePlayResult {
  const content = params.content ?? '';
  if (!content) {
    return { ok: false, error: 'Challenge content missing' };
  }

  const typed = sanitizeTypedInput(params.typedRaw, content.length);
  if (typed.length === 0) {
    return { ok: false, error: 'Typed content is required' };
  }

  const timeSeconds = Math.min(
    Math.max(0, Math.round(params.timeSeconds)),
    TIME_LIMIT_SECONDS
  );

  if (timeSeconds < 1) {
    return { ok: false, error: 'Score validation failed: invalid duration' };
  }

  const minTime = minDurationSeconds(typed.length);
  if (timeSeconds + MIN_TIME_GRACE_SECONDS < minTime) {
    return {
      ok: false,
      error: `Impossible typing speed (max ${MAX_WORDS_PER_SECOND} words/sec)`,
    };
  }

  const correctChars = countCorrectChars(typed, content);
  const accuracy = calculateAccuracy(correctChars, typed.length);
  const wpm = calculateWpm(typed.length, timeSeconds);

  if (wpm > MAX_WPM) {
    return {
      ok: false,
      error: `WPM exceeds maximum of ${MAX_WPM} (7 words per second)`,
    };
  }

  const completed = typed.length >= content.length;
  const progress = content.length > 0 ? typed.length / content.length : 0;
  const wordsTyped = countWords(typed);
  const correctWords = countCorrectWords(typed, content);
  const eligibleForLeaderboard = completed || progress >= MIN_LEADERBOARD_PROGRESS;

  return {
    ok: true,
    metrics: {
      typed,
      charsTyped: typed.length,
      correctChars,
      accuracy,
      wpm,
      timeSeconds,
      completed,
      progress,
      wordsTyped,
      correctWords,
      eligibleForLeaderboard,
    },
  };
}

/**
 * Observed race duration from server start timestamp.
 * Clamped to [1, TIME_LIMIT_SECONDS] when any typing occurred.
 */
export function raceElapsedSeconds(startedAt: number, now = Date.now()): number {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return TIME_LIMIT_SECONDS;
  const raw = Math.floor((now - startedAt) / 1000);
  return Math.min(Math.max(raw, 0), TIME_LIMIT_SECONDS);
}

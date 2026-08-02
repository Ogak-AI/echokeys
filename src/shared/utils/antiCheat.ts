/** Product anti-bot limits: 7 words/sec → 1.5s input lock. */
export const MAX_WORDS_PER_SECOND = 7;
export const MAX_WPM = MAX_WORDS_PER_SECOND * 60; // 420
export const THROTTLE_LOCK_MS = 1500;
/** ~5 chars per "word" for WPM/WPS math (standard typing metric). */
export const CHARS_PER_WORD = 5;
export const MAX_CHARS_PER_SECOND = MAX_WORDS_PER_SECOND * CHARS_PER_WORD; // 35
/** Paste / bulk-insert jumps larger than this trigger an immediate lock. */
export const MAX_INPUT_JUMP = 5;
/**
 * IME composition (CJK etc.) may commit multi-code-point clusters in one update.
 * Still capped so synthetic composition events cannot dump a full paste.
 */
export const MAX_COMPOSITION_JUMP = 12;
/** Below this humanTypingConfidence (with enough samples), log as bot-like. */
export const BOT_CONFIDENCE_WARN = 0.2;
/** Minimum interval samples before bot confidence is actionable for logging. */
export const BOT_INTERVAL_MIN_SAMPLES = 16;
/**
 * Race time cap (client + server).
 * Fixed product duration: 4 minutes per race.
 */
export const TIME_LIMIT_SECONDS = 4 * 60; // 4 minutes
/** Allowed WPM drift between client claim and server recalculation (legacy / display). */
export const WPM_TOLERANCE = 8;
/** Race session TTL — must finish (or time out) within this window (+ buffer). */
export const RACE_TTL_MS = (TIME_LIMIT_SECONDS + 2 * 60) * 1000;
/**
 * Incomplete runs rank when either:
 * - progress ≥ MIN_LEADERBOARD_PROGRESS, or
 * - correctWords ≥ MIN_LEADERBOARD_CORRECT_WORDS
 *
 * Races are ~2000 words / 4 min, so a pure 50% bar is unreachable for normal
 * typists (~80 WPM → ~320 words). Prefer an absolute correct-word floor so
 * timeouts still appear on the board (ranked by correct words, then time).
 */
export const MIN_LEADERBOARD_PROGRESS = 0.5;
/** ~20–30s of accurate typing at ~40–60 WPM — blocks empty/drive-by submits. */
export const MIN_LEADERBOARD_CORRECT_WORDS = 20;
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

/**
 * Gross WPM from characters present in the final buffer and elapsed seconds.
 * Formula: (charsTyped / 5) / (timeSeconds / 60)
 * Uses all produced characters (including errors), not only correct ones.
 */
export function calculateWpm(charsTyped: number, timeSeconds: number): number {
  if (timeSeconds <= 0 || charsTyped <= 0) return 0;
  if (!Number.isFinite(charsTyped) || !Number.isFinite(timeSeconds)) return 0;
  return Math.round(charsTyped / CHARS_PER_WORD / (timeSeconds / 60));
}

/**
 * Net WPM from correct characters only:
 * (correctChars / 5) / (timeSeconds / 60)
 * Prefer this when comparing pure speed-of-correct-input.
 */
export function calculateNetWpm(correctChars: number, timeSeconds: number): number {
  return calculateWpm(correctChars, timeSeconds);
}

/**
 * Accuracy % (0–100) from correct code points vs typed buffer length.
 * Backspaces rewrite the buffer — they do not inflate the denominator
 * (unlike raw keystroke accuracy). Clamped to [0, 100].
 */
export function calculateAccuracy(correctChars: number, typedLength: number): number {
  if (typedLength <= 0) return 100;
  if (!Number.isFinite(correctChars) || !Number.isFinite(typedLength)) return 0;
  const raw = (Math.max(0, correctChars) / Math.max(0, typedLength)) * 100;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/** Count whitespace-separated words in text. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Iterate Unicode code points (not UTF-16 code units).
 * Prevents emoji / surrogate-pair splits from desyncing correctness.
 */
export function codePoints(text: string): string[] {
  return Array.from(text);
}

/** Character-by-character matches against the challenge target (code-point aware). */
export function countCorrectChars(typed: string, target: string): number {
  const a = codePoints(typed);
  const b = codePoints(target);
  const len = Math.min(a.length, b.length);
  let ok = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) ok++;
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

/**
 * Strip control chars and bound length for short display strings / titles.
 * For source-pool text use `sanitizeSourceText` in raceExcerpt.ts.
 */
export function sanitizePrompt(raw: string, maxLen = 500): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Sanitize typed challenge input: strip control chars (keep tab/newline),
 * and never allow more characters than the challenge content.
 * `contentLength` is JS string length (UTF-16 code units) of the stored challenge.
 */
export function sanitizeTypedInput(raw: string, contentLength: number): string {
  if (typeof raw !== 'string' || contentLength <= 0) return '';
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  // Cap by code-unit length so we never exceed the stored content string bounds.
  return cleaned.slice(0, contentLength);
}

/**
 * Normalize client-supplied key intervals for bot heuristics.
 * Drops non-finite / out-of-range values and caps sample count.
 */
export function sanitizeKeyIntervals(raw: unknown, maxSamples = 64): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    if (out.length >= maxSamples) break;
    const n = typeof item === 'number' ? item : Number(item);
    if (!Number.isFinite(n) || n <= 0 || n >= 5000) continue;
    out.push(Math.round(n));
  }
  return out;
}

/**
 * Human-vs-bot confidence from inter-keystroke intervals (0 = bot-like, 1 = human-like).
 * Uses coefficient of variation + mean interval heuristics — advisory only, not a ban signal.
 */
export function humanTypingConfidence(intervalMs: number[]): number {
  const samples = intervalMs.filter((n) => Number.isFinite(n) && n > 0 && n < 5000);
  if (samples.length < 8) return 0.5; // insufficient evidence

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean <= 0) return 0;

  let variance = 0;
  for (const s of samples) variance += (s - mean) ** 2;
  variance /= samples.length;
  const std = Math.sqrt(variance);
  const cv = std / mean; // coefficient of variation

  // Perfect metronomic bots: very low CV. Humans typically CV ~0.15–0.6 at race pace.
  let score = 0.5;
  if (cv < 0.05) score -= 0.45;
  else if (cv < 0.12) score -= 0.25;
  else if (cv >= 0.15 && cv <= 0.65) score += 0.25;
  else if (cv > 1.2) score -= 0.1; // extreme jitter can be scripted noise

  // Sub-human mean interval at sustained length (~<28ms ≈ >35 cps)
  if (mean < 28 && samples.length >= 20) score -= 0.35;
  // Unnaturally round intervals (multiples of 10/16/50)
  const roundHits = samples.filter((s) => s % 10 === 0 || s % 16 === 0).length;
  if (roundHits / samples.length > 0.85 && samples.length >= 12) score -= 0.2;

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/**
 * True when interval evidence is strong enough and looks bot-like.
 * Used for monitoring only — never auto-rejects a valid race on its own.
 */
export function isBotLikeTyping(intervalMs: number[]): boolean {
  const samples = sanitizeKeyIntervals(intervalMs);
  if (samples.length < BOT_INTERVAL_MIN_SAMPLES) return false;
  return humanTypingConfidence(samples) < BOT_CONFIDENCE_WARN;
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
  /** Gross WPM from all typed code points. */
  wpm: number;
  /** Net WPM from correct code points only. */
  netWpm: number;
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

  const typedPointsForSpeed = codePoints(typed).length;
  const minTime = minDurationSeconds(typedPointsForSpeed);
  // Add MIN_TIME_GRACE_SECONDS (0.75s) to account for clock/network jitter.
  // A legitimate racer cannot physically type faster than MAX_CHARS_PER_SECOND,
  // so reject when even with the grace window the speed is impossible.
  if (timeSeconds < minTime - MIN_TIME_GRACE_SECONDS) {
    return {
      ok: false,
      error: `Impossible typing speed (max ${MAX_WORDS_PER_SECOND} words/sec)`,
    };
  }

  // Accuracy = correct code points / typed code points (final buffer, not raw keystrokes).
  // Backspaces rewrite the buffer so they do not inflate the denominator.
  const typedPoints = codePoints(typed).length;
  const contentPoints = codePoints(content).length;
  const correctChars = countCorrectChars(typed, content);
  const accuracy = calculateAccuracy(correctChars, typedPoints);
  // Gross WPM from characters produced in the final buffer (standard 5-char word).
  const wpm = calculateWpm(typedPoints, timeSeconds);
  const netWpm = calculateNetWpm(correctChars, timeSeconds);

  if (wpm > MAX_WPM || netWpm > MAX_WPM) {
    return {
      ok: false,
      error: `WPM exceeds maximum of ${MAX_WPM} (7 words per second)`,
    };
  }

  // Length-complete requires every content code point to be present in order.
  // Wrong characters still count as "completed" length-wise; ranking uses correctWords.
  const completed = typedPoints >= contentPoints && contentPoints > 0;
  const progress = contentPoints > 0 ? Math.min(1, typedPoints / contentPoints) : 0;
  const wordsTyped = countWords(typed);
  const correctWords = countCorrectWords(typed, content);
  // Ranking requires real correct-word progress. Length-complete garbage
  // (0 correct words) must never enter the board — completion alone is not enough.
  const eligibleForLeaderboard =
    correctWords >= MIN_LEADERBOARD_CORRECT_WORDS ||
    (progress >= MIN_LEADERBOARD_PROGRESS && correctWords > 0);

  return {
    ok: true,
    metrics: {
      typed,
      charsTyped: typedPoints,
      correctChars,
      accuracy,
      wpm,
      netWpm,
      timeSeconds,
      completed,
      progress,
      wordsTyped,
      correctWords,
      eligibleForLeaderboard,
    },
  };
}

/** User-facing explanation when a run is saved but not ranked. */
export function leaderboardIneligibleReason(): string {
  return `Run saved — needs ${MIN_LEADERBOARD_CORRECT_WORDS}+ correct words, or ${Math.round(MIN_LEADERBOARD_PROGRESS * 100)}%+ progress with at least 1 correct word, to rank`;
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

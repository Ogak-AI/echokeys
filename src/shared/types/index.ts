// ============================================================
// Echokeys — Shared Types
// ============================================================

export type ContentDomain = 'code' | 'prose' | 'legal' | 'marketing' | 'technical' | 'creative';

export const DOMAIN_COLORS: Record<ContentDomain, string> = {
  code: '#569cd6',
  prose: '#d4d4d4',
  legal: '#c586c0',
  marketing: '#ce9178',
  technical: '#9cdcfe',
  creative: '#dcdcaa',
};

export const ALL_DOMAINS: ContentDomain[] = [
  'code',
  'prose',
  'legal',
  'marketing',
  'technical',
  'creative',
];

export type Challenge = {
  id: string;
  prompt: string;
  content: string;
  domain: ContentDomain;
  lineCount: number;
  createdAt: number;
  communityId: string;
  createdBy?: string;
  postId?: string;
};

export type PlayerScore = {
  id: string;
  username: string;
  challengeId: string;
  prompt?: string;
  domain?: ContentDomain;
  wpm: number;
  accuracy: number;
  timeSeconds: number;
  score: number;
  completed: boolean;
  playedAt: number;
  communityId: string;
  wordsTyped: number;
  /** Fully correct words in this run — primary ranking metric. */
  correctWords: number;
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  /** Composite display score from the player's best ranked run. */
  score: number;
  accuracy: number;
  bestWpm: number;
  challengesCompleted: number;
  lastPlayed: number;
  badges: string[];
  totalWordsTyped: number;
  /**
   * Best single-run correct-word count for this board period.
   * Ranking primary: higher is better.
   */
  bestCorrectWords: number;
  /**
   * Time (seconds) of the best correct-word run.
   * Ranking secondary: lower is better when correct words tie.
   */
  bestTimeSeconds: number;
};

export type PlayerProfile = {
  username: string;
  bestWpm: number;
  bestAccuracy: number;
  totalChallenges: number;
  badges: string[];
  domainCounts: Partial<Record<ContentDomain, number>>;
  lastPlayed: number | null;
  joinedAt: number;
  totalWordsTyped: number;
  communityId?: string;
  /** Personal-best correct words in a single ranked run. */
  bestCorrectWords?: number;
  /** Time of that personal-best run (seconds). */
  bestTimeSeconds?: number;
};

export type LeaderboardUpdate = {
  entries: LeaderboardEntry[];
  period: string;
  updatedAt: number;
};

/**
 * Display composite for a single run (not the leaderboard sort key).
 * Score = (Accuracy% × 100) + WPM − (TimeSeconds / 60)
 * accuracyRatio is 0–1 (e.g. 0.95 → 95%).
 *
 * Leaderboards rank by correct words (desc), then time (asc) — see isBetterRun.
 */
export function calculateScore(accuracyRatio: number, wpm: number, timeSeconds: number): number {
  const accuracyPct = Math.max(0, Math.min(1, accuracyRatio)) * 100;
  const safeWpm = Math.max(0, wpm);
  const safeTime = Math.max(0, timeSeconds);
  return Math.round((accuracyPct + safeWpm - safeTime / 60) * 100) / 100;
}

/**
 * True when `candidate` outranks `current` on the leaderboard:
 * more correct words first; on a tie, lower time wins.
 */
export function isBetterRun(
  candidate: { correctWords: number; timeSeconds: number },
  current: { correctWords: number; timeSeconds: number }
): boolean {
  const cWords = Math.max(0, candidate.correctWords || 0);
  const curWords = Math.max(0, current.correctWords || 0);
  if (cWords !== curWords) return cWords > curWords;

  const cTime = Math.max(0, candidate.timeSeconds || 0);
  const curTime = Math.max(0, current.timeSeconds || 0);
  // Prefer a recorded time over a missing one; lower is better.
  if (curTime <= 0 && cTime > 0) return true;
  if (cTime <= 0 && curTime > 0) return false;
  return cTime < curTime;
}

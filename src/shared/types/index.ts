// ============================================================
// Echokeys — Shared Types
// ============================================================

export type Difficulty = 'easy' | 'medium' | 'hard';

export type ContentDomain = 'code' | 'prose' | 'legal' | 'marketing' | 'technical' | 'creative';

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { label: string; timeSeconds: number; minLines: number; maxLines: number; color: string }
> = {
  easy: { label: 'Easy', timeSeconds: 600, minLines: 25, maxLines: 50, color: '#4ec9b0' },
  medium: { label: 'Medium', timeSeconds: 480, minLines: 75, maxLines: 150, color: '#dcdcaa' },
  hard: { label: 'Hard', timeSeconds: 300, minLines: 200, maxLines: 300, color: '#f48771' },
};

export const DOMAIN_COLORS: Record<ContentDomain, string> = {
  code: '#569cd6',
  prose: '#d4d4d4',
  legal: '#c586c0',
  marketing: '#ce9178',
  technical: '#9cdcfe',
  creative: '#dcdcaa',
};

export type Challenge = {
  id: string;
  prompt: string;
  content: string;
  difficulty: Difficulty;
  domain: ContentDomain;
  lineCount: number;
  createdAt: number;
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
  communityId?: string;
  wordsTyped?: number;
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
  accuracy: number;
  bestWpm: number;
  challengesCompleted: number;
  lastPlayed: number;
  badges: string[];
  totalWordsTyped: number;
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
};

export type LeaderboardUpdate = {
  entries: LeaderboardEntry[];
  period: string;
  updatedAt: number;
};

/**
 * Score = (Accuracy% × 100) + WPM − (TimeSeconds / 60)
 * where accuracyRatio is 0–1 (e.g. 0.95 → Accuracy% of 95).
 */
export function calculateScore(accuracyRatio: number, wpm: number, timeSeconds: number): number {
  const accuracyPct = Math.max(0, Math.min(1, accuracyRatio)) * 100;
  return Math.round((accuracyPct + wpm - timeSeconds / 60) * 100) / 100;
}

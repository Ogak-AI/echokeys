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
 * accuracyRatio is 0–1 (e.g. 0.95 → 95%).
 */
export function calculateScore(accuracyRatio: number, wpm: number, timeSeconds: number): number {
  const accuracyPct = Math.max(0, Math.min(1, accuracyRatio)) * 100;
  const safeWpm = Math.max(0, wpm);
  const safeTime = Math.max(0, timeSeconds);
  return Math.round((accuracyPct + safeWpm - safeTime / 60) * 100) / 100;
}

// ============================================================
// Echokeys — Shared Type Definitions
// ============================================================

// --- Enums & Constants ---

export type Difficulty = 'easy' | 'medium' | 'hard';

export type ChallengeContentType = 'code' | 'typing' | 'marketing' | 'legal' | 'creative' | 'technical';

export type Language =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'go'
  | 'rust'
  | 'java'
  | 'c'
  | 'cpp';

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { label: string; minLines: number; maxLines: number; timeLimitSeconds: number }
> = {
  easy: { label: 'Easy', minLines: 25, maxLines: 50, timeLimitSeconds: 600 },
  medium: { label: 'Medium', minLines: 75, maxLines: 150, timeLimitSeconds: 480 },
  hard: { label: 'Hard', minLines: 200, maxLines: 300, timeLimitSeconds: 300 },
};

export const CONTENT_TYPES: Record<ChallengeContentType, { label: string; description: string }> = {
  code: { label: 'Code', description: 'Generate a programming snippet to type' },
  typing: { label: 'Typing', description: 'Generate a polished prose passage to type' },
  marketing: { label: 'Marketing', description: 'Generate marketing copy to type' },
  legal: { label: 'Legal', description: 'Generate a concise legal draft to type' },
  creative: { label: 'Creative', description: 'Generate creative writing to type' },
  technical: { label: 'Technical', description: 'Generate technical prose to type' },
};

export const LANGUAGES: Record<Language, { label: string; prismKey: string }> = {
  python: { label: 'Python', prismKey: 'python' },
  javascript: { label: 'JavaScript', prismKey: 'javascript' },
  typescript: { label: 'TypeScript', prismKey: 'typescript' },
  go: { label: 'Go', prismKey: 'go' },
  rust: { label: 'Rust', prismKey: 'rust' },
  java: { label: 'Java', prismKey: 'java' },
  c: { label: 'C', prismKey: 'c' },
  cpp: { label: 'C++', prismKey: 'cpp' },
};

// --- Database Models ---

export interface User {
  id: string;
  username: string;
  created_at: string;
  last_played: string | null;
}

export interface Challenge {
  id: string;
  concept: string;
  code: string;
  language: Language;
  difficulty: Difficulty;
  line_count: number;
  content_type?: ChallengeContentType;
  domain?: string;
  created_at: string;
}

export interface Score {
  id: string;
  user_id: string;
  challenge_id: string;
  wpm: number;
  accuracy: number;
  time_seconds: number;
  score: number;
  completed: boolean;
  played_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  score: number;
  accuracy: number;
  best_wpm: number;
  challenges_completed: number;
  last_played: string;
  badges?: string[];
}

export interface WeeklySnapshot {
  id: string;
  week_start: string;
  week_end: string;
  snapshot_data: LeaderboardEntry[];
  created_at: string;
}

export interface MonthlySnapshot {
  id: string;
  year: number;
  month: number;
  snapshot_data: LeaderboardEntry[];
  created_at: string;
}

export interface YearlySnapshot {
  id: string;
  year: number;
  snapshot_data: LeaderboardEntry[];
  created_at: string;
}

// --- API Request/Response Types ---

export interface LoginRequest {
  username: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface GenerateChallengeRequest {
  concept?: string;
  language: Language;
  difficulty: Difficulty;
  contentType?: ChallengeContentType;
  domain?: string;
}

export interface GenerateChallengeResponse {
  challenge: Challenge;
}

export interface SubmitScoreRequest {
  challenge_id: string;
  wpm: number;
  accuracy: number;
  time_seconds: number;
  completed: boolean;
}

export interface SubmitScoreResponse {
  score: Score;
  weekly_rank: number | null;
  all_time_rank: number | null;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  period: string;
  updated_at: string;
}

export interface UserProfileResponse {
  user: User;
  best_wpm: number;
  best_accuracy: number;
  total_challenges: number;
  favorite_languages: { language: Language; count: number }[];
  recent_scores: Score[];
  badges: string[];
}

// --- WebSocket Event Types ---

export interface WsLeaderboardUpdate {
  type: 'leaderboard_update';
  entries: LeaderboardEntry[];
}

export interface WsPlayerProgress {
  type: 'player_progress';
  user_id: string;
  username: string;
  wpm: number;
  accuracy: number;
  progress: number; // 0-100%
}

export interface WsGameComplete {
  type: 'game_complete';
  user_id: string;
  username: string;
  score: number;
  wpm: number;
  accuracy: number;
}

export type WsServerEvent = WsLeaderboardUpdate | WsPlayerProgress | WsGameComplete;

export type WsClientEvent =
  | { type: 'subscribe_leaderboard' }
  | { type: 'unsubscribe_leaderboard' }
  | { type: 'game_progress'; wpm: number; accuracy: number; progress: number }
  | { type: 'game_start'; challenge_id: string }
  | { type: 'game_end'; challenge_id: string; score: number };

// --- Utility ---

/** Calculate score from accuracy, WPM, and time */
export function calculateScore(accuracy: number, wpm: number, timeSeconds: number): number {
  return Math.round(((accuracy * 100) + wpm - (timeSeconds / 60)) * 100) / 100;
}

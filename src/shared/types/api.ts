export type WebSocketGameUpdate = WatchGameResponse;

export type GameEndedMessage = {
  type: 'gameEnded';
  username: string;
  reason?: string;
};

export type WebSocketMessage = WebSocketGameUpdate | GameEndedMessage;

export type TypingSnapshot = {
  userId: string;
  username: string;
  typedText: string;
  cursorPosition: number;
  wpm: number;
  accuracy: number;
  lastUpdateTime: number;
  status: 'typing' | 'finished';
};

export type GameSession = {
  sessionId: string;
  challengeId: string;
  challengeText: string;
  difficulty: 'easy' | 'medium' | 'hard';
  players: string[];
  typingSnapshots: Record<string, TypingSnapshot>;
  status: 'waiting' | 'active' | 'finished';
  startTime: number;
  endTime?: number;
};

export type WatchGameResponse = {
  type: 'watchGame';
  username: string;
  challenge: DailyChallenge;
  currentInput: string;
  startTime: number;
  wpm: number;
  accuracy: number;
  gameCompleted?: boolean;
  lastUpdate?: number;
  errorIndexes?: number[]; // Add errorIndexes
};

export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
  userStats: UserStats;
  dailyChallenge: DailyChallenge;
};

export type SubmitScoreResponse = {
  type: 'submitScore';
  postId: string;
  newHighScore: boolean;
  rank: number;
};

export type GetLeaderboardResponse = {
  type: 'leaderboard';
  leaderboard: LeaderboardEntry[];
};

export type UserStats = {
  bestWPM: number;
  bestAccuracy: number;
  totalGames: number;
  streak: number;
};

export type DailyChallenge = {
  id: string;
  text: string;
  date: string;
  difficulty: 'easy' | 'medium' | 'hard';
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  wpm: number;
  accuracy: number;
  date: string;
};

export type GameResult = {
  wpm: number;
  accuracy: number;
  time: number;
  challengeId: string;
};

// Spectator System Types
export type ActiveGameSession = {
  sessionId: string;
  username: string;
  wpm: number;
  accuracy: number;
  spectatorCount: number;
  verseId: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type SpectatorJoinedMessage = {
  type: 'JOINED';
  session: SpectatorGameState;
};

export type SpectatorGameState = {
  sessionId: string;
  username: string;
  verseText: string;
  currentText: string;
  wpm: number;
  accuracy: number;
  elapsedTime: number;
  spectatorCount: number;
};

export type PlayerProgressMessage = {
  type: 'PLAYER_PROGRESS';
  sessionId: string;
  currentText: string;
  wpm: number;
  accuracy: number;
  elapsedTime: number;
};

export type GameEndedMessage_Spectator = {
  type: 'GAME_ENDED';
  sessionId: string;
  finalWpm: number;
  finalAccuracy: number;
  totalTime: number;
};

export type GameStartedMessage = {
  type: 'GAME_STARTED';
  sessionId: string;
  username: string;
  verseText: string;
  startedAt: number;
};


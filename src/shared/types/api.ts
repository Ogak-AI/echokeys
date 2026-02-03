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
};

export type GetActiveGamesResponse = {
  type: 'activeGames';
  games: { 
    username: string; 
    challenge: DailyChallenge;
    difficulty: 'easy' | 'medium' | 'hard';
  }[];
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

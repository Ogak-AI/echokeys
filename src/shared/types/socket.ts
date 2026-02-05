export interface GameChallenge {
  id: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Player {
  id: string;
  username: string;
  currentInput: string;
  wpm: number;
  accuracy: number;
  startTime: number;
  errorIndexes: number[];
  isFinished: boolean;
}

export interface GameRoom {
  id: string;
  challenge: GameChallenge;
  players: Map<string, Player>;
  spectators: Set<string>;
  createdAt: number;
  status: 'waiting' | 'active' | 'finished';
}

export interface GameStateUpdate {
  type: 'gameState';
  roomId: string;
  players: Player[];
  timestamp: number;
}

export interface PlayerJoined {
  type: 'playerJoined';
  roomId: string;
  player: Player;
}

export interface PlayerLeft {
  type: 'playerLeft';
  roomId: string;
  playerId: string;
}

export interface GameFinished {
  type: 'gameFinished';
  roomId: string;
  finalResults: Player[];
}

export type SocketMessage =
  | GameStateUpdate
  | PlayerJoined
  | PlayerLeft
  | GameFinished;

export interface CreateGameRequest {
  username: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface JoinGameRequest {
  roomId: string;
  username: string;
  asSpectator?: boolean;
}

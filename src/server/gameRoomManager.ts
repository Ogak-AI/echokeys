import { Socket } from 'socket.io';
import { Server as SocketIOServer } from 'socket.io';
import { GameRoom, Player, GameStateUpdate, PlayerJoined } from '../shared/types/socket.js';
import { ChallengeManager } from './challengeManager.js';

export class GameRoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private challengeManager: ChallengeManager;

  constructor(challengeManager: ChallengeManager) {
    this.challengeManager = challengeManager;
  }

  createGame(_username: string, difficulty: 'easy' | 'medium' | 'hard'):
    | string
    | { roomId: string; challenge: GameChallenge } {
    const roomId = this.generateRoomId();
    const challenge = this.challengeManager.getRandomChallenge(difficulty);

    const room: GameRoom = {
      id: roomId,
      challenge,
      players: new Map(),
      spectators: new Set(),
      createdAt: Date.now(),
      status: 'waiting',
    };

    this.rooms.set(roomId, room);
    console.log(`Created game room ${roomId} with difficulty ${difficulty}`);

    return { roomId, challenge };
  }

  joinGame(
    socket: Socket,
    roomId: string,
    username: string,
    asSpectator: boolean = false
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    // Leave previous room if any
    this.leaveGame(socket.id);

    // Join the socket.io room
    void socket.join(roomId);
    this.socketToRoom.set(socket.id, roomId);

    // Only allow players, not spectators - simplify
    if (asSpectator) {
      console.log(`Spectator ${username} (${socket.id}) attempted to join room ${roomId} - spectators disabled`);
      return false;
    }

    // Add as player
    const player: Player = {
      id: socket.id,
      username,
      currentInput: '',
      wpm: 0,
      accuracy: 100,
      startTime: Date.now(),
      errorIndexes: [],
      isFinished: false,
    };

    room.players.set(socket.id, player);

    // Start the game if this is the first player
    if (room.players.size === 1) {
      room.status = 'active';
    }

    console.log(`Player ${username} (${socket.id}) joined room ${roomId}`);

    // Notify all clients in the room
    const playerJoinedMessage: PlayerJoined = {
      type: 'playerJoined',
      roomId,
      player,
    };

    socket.to(roomId).emit('message', playerJoinedMessage);

    return true;
  }

  updatePlayerProgress(
    socketId: string,
    roomId: string,
    update: {
      currentInput: string;
      wpm: number;
      accuracy: number;
      errorIndexes: number[];
    }
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(socketId);
    if (!player) return;

    // Update player state
    player.currentInput = update.currentInput;
    player.wpm = update.wpm;
    player.accuracy = update.accuracy;
    player.errorIndexes = update.errorIndexes;

    // Check if player finished
    if (update.currentInput.length >= room.challenge.text.length && !player.isFinished) {
      player.isFinished = true;

      // Check if all players finished
      const allFinished = Array.from(room.players.values()).every((p) => p.isFinished);
      if (allFinished) {
        room.status = 'finished';
        this.endGame(roomId);
      }
    }
  }

  leaveGame(socketId: string): void {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    // Remove from players or spectators
    if (room.players.has(socketId)) {
      room.players.delete(socketId);

      // Notify others
      // const playerLeftMessage: PlayerLeft = {
      //   type: 'playerLeft',
      //   roomId,
      //   playerId: socketId
      // };

      room.players.forEach((_, playerId) => {
        if (playerId !== socketId) {
          // Note: We can't emit directly to specific socket here
          // The socket.io server will handle this
        }
      });

      // If no players left, end the game
      if (room.players.size === 0) {
        this.endGame(roomId);
      }
    } else if (room.spectators.has(socketId)) {
      room.spectators.delete(socketId);
    }

    this.socketToRoom.delete(socketId);
    console.log(`Client ${socketId} left room ${roomId}`);
  }

  broadcastGameStates(io: SocketIOServer): void {
    for (const [roomId, room] of this.rooms) {
      if (room.status === 'active' && room.players.size > 0) {
        const players = Array.from(room.players.values());
        const gameStateUpdate: GameStateUpdate = {
          type: 'gameState',
          roomId,
          players,
          timestamp: Date.now(),
        };

        io.to(roomId).emit('message', gameStateUpdate);
      }
    }
  }

  private endGame(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.status = 'finished';
    // const finalResults = Array.from(room.players.values());

    // const gameFinishedMessage: GameFinished = {
    //   type: 'gameFinished',
    //   roomId,
    //   finalResults
    // };

    // Broadcast to all in room
    // Note: In a real implementation, you'd get the io instance
    // For now, we'll assume it's handled by the caller

    console.log(`Game ${roomId} finished`);

    // Clean up room after some time
    setTimeout(() => {
      this.rooms.delete(roomId);
      console.log(`Cleaned up room ${roomId}`);
    }, 300000); // 5 minutes
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

import { useCallback, useEffect, useState } from 'react';
import { context } from '@devvit/web/client';
import { io, Socket } from 'socket.io-client';
import type {
  InitResponse,
  GetLeaderboardResponse,
  UserStats,
  DailyChallenge,
  GameResult,
} from '../../shared/types/api';
import { GameChallenge } from '../../shared/types/socket';

interface GameState {
  username: string | null;
  userStats: UserStats | null;
  dailyChallenge: DailyChallenge | null;
  loading: boolean;
  gameStarted: boolean;
  gameFinished: boolean;
  currentInput: string;
  startTime: number | null;
  endTime: number | null;
  wpm: number;
  accuracy: number;
  leaderboard: GetLeaderboardResponse['leaderboard'];
  showLeaderboard: boolean;
  showDifficultySelect: boolean;
  selectedDifficulty: 'easy' | 'medium' | 'hard' | null;
  lastSpokenIndex: number;
  isMuted: boolean;
  errorIndexes: number[];
  socket: Socket | null;
  roomId: string | null;
  challenge: GameChallenge | null;
}

export const useTypingGame = () => {
  const [state, setState] = useState<GameState>({
    username: null,
    userStats: null,
    dailyChallenge: null,
    loading: true,
    gameStarted: false,
    gameFinished: false,
    currentInput: '',
    startTime: null,
    endTime: null,
    wpm: 0,
    accuracy: 0,
    leaderboard: [],
    showLeaderboard: false,
    showDifficultySelect: true,
    selectedDifficulty: null,
    lastSpokenIndex: 0,
    isMuted: false,
    errorIndexes: [],
    socket: null,
    roomId: null,
    challenge: null,
  });

  // Initialize Socket.IO and fetch initial data
  useEffect(() => {
    // Initialize Socket.IO connection
    const socketConnection = io();
    setState((prev) => ({ ...prev, socket: socketConnection }));

    socketConnection.on('connect', () => {
      console.log('Connected to Socket.IO server');
    });

    socketConnection.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
    });

    socketConnection.on('gameCreated', (data: { roomId: string }) => {
      console.log('Game created:', data);
      setState((prev) => ({ ...prev, roomId: data.roomId }));

      // Join the game as a player
      socketConnection.emit('joinGame', {
        roomId: data.roomId,
        username: state.username || 'Player',
        asSpectator: false,
      });
    });

    socketConnection.on('joinedGame', (data: { roomId: string; asSpectator: boolean }) => {
      console.log('Joined game:', data);
      setState((prev) => ({ ...prev, roomId: data.roomId }));

      // For now, we'll need to get the challenge from the server
      // In a full implementation, the server would send the challenge when joining
      // For now, let's fetch it from the old API as a fallback
      if (!data.asSpectator) {
        fetch(`/api/challenge/${state.selectedDifficulty || 'easy'}`)
          .then((res) => res.json())
          .then((challengeData: DailyChallenge) => {
            setState((prev) => ({
              ...prev,
              challenge: {
                id: challengeData.id,
                text: challengeData.text,
                difficulty: challengeData.difficulty,
              },
            }));
          })
          .catch((err) => console.error('Failed to fetch challenge:', err));
      }
    });

    socketConnection.on('error', (error: { message: string }) => {
      console.error('Socket.IO error:', error);
    });

    // Fetch initial user data
    const init = async () => {
      try {
        console.log('Attempting to fetch /api/init...');
        console.log('Devvit context available:', context);
        console.log('Devvit context username:', context?.username);

        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: InitResponse = await res.json();
        console.log('Received data from /api/init:', data);
        if (data.type !== 'init') throw new Error('Unexpected response');
        setState((prev) => ({
          ...prev,
          username: data.username,
          userStats: data.userStats,
          dailyChallenge: data.dailyChallenge,
          loading: false,
          showDifficultySelect: true,
        }));
      } catch (err) {
        console.error('Failed to init game', err);
        console.log('Devvit context username:', context?.username);
        setState((prev) => ({
          ...prev,
          loading: false,
          showDifficultySelect: true,
          username: context?.username || 'Player',
        }));
      }
    };
    void init();

    return () => {
      socketConnection.disconnect();
    };
  }, [state.selectedDifficulty, state.username]);

  const startGame = useCallback(() => {
    setState((prev) => ({
      ...prev,
      gameStarted: true,
      startTime: Date.now(),
      currentInput: '',
      gameFinished: false,
      wpm: 0,
      accuracy: 0,
    }));
  }, []);

  const selectDifficulty = useCallback(
    async (difficulty: 'easy' | 'medium' | 'hard') => {
      if (!state.socket || !state.username) return;

      try {
        // Create a new game room
        state.socket.emit('createGame', {
          username: state.username,
          difficulty,
        });

        setState((prev) => ({
          ...prev,
          selectedDifficulty: difficulty,
          showDifficultySelect: false,
        }));
      } catch (err) {
        console.error('Failed to create game', err);
      }
    },
    [state.socket, state.username]
  );

  const updateInput = useCallback(
    (input: string) => {
      const challenge = state.challenge;
      if (!challenge || !state.gameStarted || state.gameFinished) return;

      // Use a variable to track the spoken index within this function call
      let currentSpokenIndex = state.lastSpokenIndex;

      // Detect newly completed words since last spoken position
      if (input.length > currentSpokenIndex) {
        const textSinceLastSpoken = input.slice(currentSpokenIndex);
        // Use a global match to find all completed words
        const completedWords = textSinceLastSpoken.matchAll(/([\w']+)[\s.,!?;:\-—]/g);

        for (const match of completedWords) {
          const completedWord = match[1];
          if (completedWord && window.speechSynthesis && !state.isMuted) {
            console.log('Speaking word:', completedWord); // for debugging
            const utterance = new SpeechSynthesisUtterance(completedWord);
            utterance.rate = 1.2; // Slightly faster rate
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
          }
          // Update the spoken index to the position after the completed word and delimiter
          currentSpokenIndex = currentSpokenIndex + match.index + match[0].length;
        }
      }

      const isFinished = input.length >= challenge.text.length;
      const endTime = isFinished ? Date.now() : null;

      // Calculate WPM and accuracy
      const timeElapsed = (endTime || Date.now()) - (state.startTime || Date.now());
      const minutes = timeElapsed / 60000;
      const wordsTyped = input.length / 5;
      const wpm = minutes > 0 ? Math.round(wordsTyped / minutes) : 0;

      const newErrorIndexes: number[] = [];
      let correctChars = 0;
      for (let i = 0; i < input.length; i++) {
        if (input[i] === challenge.text[i]) {
          correctChars++;
        } else {
          newErrorIndexes.push(i);
        }
      }
      const accuracy = input.length > 0 ? Math.round((correctChars / input.length) * 100) : 0;

      setState((prev) => ({
        ...prev,
        currentInput: input,
        endTime,
        gameFinished: isFinished,
        wpm,
        accuracy,
        lastSpokenIndex: currentSpokenIndex,
        errorIndexes: newErrorIndexes, // Update state with the new error indexes
      }));

      // Send game progress to server for spectators via Socket.IO
      if (state.socket && state.roomId && state.username && state.challenge && state.startTime) {
        state.socket.emit('updateProgress', {
          roomId: state.roomId,
          currentInput: input,
          wpm,
          accuracy,
          errorIndexes: newErrorIndexes,
        });
      }

      if (isFinished) {
        window.speechSynthesis.cancel(); // Stop any lingering speech
        // Submit score
        const result: GameResult = {
          wpm,
          accuracy,
          time: timeElapsed,
          challengeId: challenge.id,
        };
        fetch('/api/submit-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        }).catch((err) => console.error('Failed to submit score', err));
      }
    },
    [
      state.challenge,
      state.gameStarted,
      state.gameFinished,
      state.startTime,
      state.isMuted,
      state.lastSpokenIndex,
      state.socket,
      state.roomId,
      state.username,
    ]
  );

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GetLeaderboardResponse = await res.json();
      setState((prev) => ({ ...prev, leaderboard: data.leaderboard, showLeaderboard: true }));
    } catch (err) {
      console.error('Failed to fetch leaderboard', err);
    }
  }, []);

  const toggleLeaderboard = useCallback(() => {
    setState((prev) => ({ ...prev, showLeaderboard: !prev.showLeaderboard }));
  }, []);

  const resetGame = useCallback(() => {
    window.speechSynthesis.cancel();
    // Remove player from active games when game is reset
    fetch('/api/remove-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch((err) => console.error('Failed to remove player from active games', err));

    setState((prev) => ({
      ...prev,
      gameStarted: false,
      gameFinished: false,
      currentInput: '',
      startTime: null,
      endTime: null,
      wpm: 0,
      accuracy: 0,
      showDifficultySelect: true,
      selectedDifficulty: null,
      lastSpokenIndex: 0,
      isMuted: false,
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((prev) => {
      const newMutedState = !prev.isMuted;
      if (newMutedState) {
        window.speechSynthesis.cancel();
      } else {
        window.speechSynthesis.resume();
      }
      return { ...prev, isMuted: newMutedState };
    });
  }, []);

  return {
    ...state,
    startGame,
    selectDifficulty,
    updateInput,
    fetchLeaderboard,
    toggleLeaderboard,
    resetGame,
    toggleMute,
    errorIndexes: state.errorIndexes,
  };
};

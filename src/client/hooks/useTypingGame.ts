import { useCallback, useEffect, useState } from 'react';
import { context } from '@devvit/web/client';
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
    roomId: null,
    challenge: null,
  });

  // Fetch initial data (no sockets)
  useEffect(() => {
    const init = async () => {
      try {
        console.log('Attempting to fetch /api/init...');
        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: InitResponse = await res.json();
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
        setState((prev) => ({
          ...prev,
          loading: false,
          showDifficultySelect: true,
          username: context?.username || 'Player',
        }));
      }
    };
    void init();
  }, []);

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
      try {
        const res = await fetch(`/api/challenge/${difficulty}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const challengeData: DailyChallenge = await res.json();
        setState((prev) => ({
          ...prev,
          selectedDifficulty: difficulty,
          showDifficultySelect: false,
          challenge: {
            id: challengeData.id,
            text: challengeData.text,
            difficulty: challengeData.difficulty as 'easy' | 'medium' | 'hard',
          },
        }));
      } catch (err) {
        console.error('Failed to load challenge for difficulty', err);
      }
    },
    []
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

      // No realtime spectators: progress is client-only now

      if (isFinished) {
        window.speechSynthesis.cancel(); // Stop any lingering speech
        // Submit score
        const result: GameResult = {
          wpm,
          accuracy,
          time: timeElapsed,
          challengeId: challenge.id,
        };
        fetch('/api/submit', {
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

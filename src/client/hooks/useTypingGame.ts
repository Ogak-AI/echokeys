import { useCallback, useEffect, useState } from 'react';
import { context } from '@devvit/web/client';
import type { GameChallenge } from '../../shared/types/socket'; // Removed GetLeaderboardResponse, UserStats

interface GameState {
  username: string | null;
  // userStats: UserStats | null; // Removed
  challenge: GameChallenge | null; // Unified challenge object
  loading: boolean;
  gameStarted: boolean;
  gameFinished: boolean;
  currentInput: string;
  startTime: number | null;
  endTime: number | null;
  wpm: number;
  accuracy: number;
  // leaderboard: GetLeaderboardResponse['leaderboard']; // Removed
  // showLeaderboard: boolean; // Removed
  showDifficultySelect: boolean;
  selectedDifficulty: 'easy' | 'medium' | 'hard' | null;
  lastSpokenIndex: number;
  isMuted: boolean;
  errorIndexes: number[];
  roomId: string | null;
}

// Accept allChallenges as a prop
export const useTypingGame = (allChallenges: GameChallenge[]) => {
  const [state, setState] = useState<GameState>({
    username: null,
    // userStats: null, // Removed
    challenge: null, // Unified challenge object
    loading: true,
    gameStarted: false,
    gameFinished: false,
    currentInput: '',
    startTime: null,
    endTime: null,
    wpm: 0,
    accuracy: 0,
    // leaderboard: [], // Removed
    // showLeaderboard: false, // Removed
    showDifficultySelect: true,
    selectedDifficulty: null,
    lastSpokenIndex: 0,
    isMuted: false,
    errorIndexes: [],
    roomId: null,
  });

  useEffect(() => {
    // Get username from Devvit context if available
    const username = context?.username || 'Player';

    setState((prev) => ({
      ...prev,
      username,
      // userStats: { // Removed
      //   bestWPM: 0,
      //   bestAccuracy: 0,
      //   totalGames: 0,
      //   streak: 0,
      // },
      loading: false,
      showDifficultySelect: true,
      challenge: null, // Will be set when difficulty is selected
    }));
  }, []);

  const startGame = useCallback(async () => {
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

  const selectDifficulty = useCallback(async (difficulty: 'easy' | 'medium' | 'hard') => {
    // Filter challenges by difficulty
    const difficultyChallenges = allChallenges.filter(c => c.difficulty === difficulty);

    if (difficultyChallenges.length === 0) {
      console.warn(`No challenges found for difficulty: ${difficulty}. Using fallback.`);
      // Fallback to a generic challenge if none for the selected difficulty
      // This should ideally not happen if challenges.json is well-populated
      setState((prev) => ({
        ...prev,
        selectedDifficulty: difficulty,
        showDifficultySelect: false,
        challenge: {
          id: 'fallback-client',
          text: 'The quick brown fox jumps over the lazy dog.',
          difficulty: 'easy',
        },
      }));
      return;
    }

    // Pick a random challenge from the filtered list
    const randomIndex = Math.floor(Math.random() * difficultyChallenges.length);
    const selectedChallenge = difficultyChallenges[randomIndex];

    setState((prev) => ({
      ...prev,
      selectedDifficulty: difficulty,
      showDifficultySelect: false,
      challenge: selectedChallenge,
    }));
  }, [allChallenges]); // allChallenges is a dependency

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

      if (isFinished) {
        window.speechSynthesis.cancel(); // Stop any lingering speech
        // Score submission disabled - focus on gameplay first
        console.log('Game finished with WPM:', wpm, 'Accuracy:', accuracy);
      }
    },
    [
      state.challenge,
      state.gameStarted,
      state.gameFinished,
      state.startTime,
      state.isMuted,
      state.lastSpokenIndex,
    ]
  );

  // Removed fetchLeaderboard
  // Removed toggleLeaderboard

  const resetGame = useCallback(() => {
    window.speechSynthesis.cancel();
    // Game reset - no network calls needed

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
      // showLeaderboard: false, // Removed
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
    // fetchLeaderboard, // Removed
    // toggleLeaderboard, // Removed
    resetGame,
    toggleMute,
    errorIndexes: state.errorIndexes,
  };
};

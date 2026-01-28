import { useCallback, useEffect, useState } from 'react';
import type { InitResponse, GetLeaderboardResponse, UserStats, DailyChallenge, GameResult } from '../../shared/types/api';

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
  });

  // fetch initial data
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: InitResponse = await res.json();
        console.log('Received data from /api/init:', data);
        if (data.type !== 'init') throw new Error('Unexpected response');
        setState(prev => ({
          ...prev,
          username: data.username,
          userStats: data.userStats,
          dailyChallenge: data.dailyChallenge,
          loading: false,
          showDifficultySelect: true,
        }));
      } catch (err) {
        console.error('Failed to init game', err);
        setState(prev => ({ ...prev, loading: false, showDifficultySelect: true }));
      }
    };
    void init();
  }, []);

  const startGame = useCallback(() => {
    setState(prev => ({
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
    try {
      const res = await fetch(`/api/challenge/${difficulty}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { challenge: DailyChallenge } = await res.json();
      setState(prev => ({
        ...prev,
        selectedDifficulty: difficulty,
        dailyChallenge: data.challenge,
        showDifficultySelect: false,
      }));
    } catch (err) {
      console.error('Failed to fetch challenge for difficulty', err);
    }
  }, []);

  const updateInput = useCallback((input: string) => {
    const challenge = state.dailyChallenge;
    if (!challenge || !state.gameStarted || state.gameFinished) return;

    // Detect newly completed words since last spoken position
    if (input.length > state.lastSpokenIndex) {
      const textSinceLastSpoken = input.slice(state.lastSpokenIndex);
      
      // Check if a word was just completed (space or punctuation at the end)
      const wordBoundaryMatch = textSinceLastSpoken.match(/([\w']+)[\s.,!?;:\-—]/);
      if (wordBoundaryMatch) {
        const completedWord = wordBoundaryMatch[1];
        
        if (completedWord && window.speechSynthesis && !state.isMuted) {
          const utterance = new SpeechSynthesisUtterance(completedWord);
          utterance.rate = 1;
          utterance.pitch = 1;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
          
          // Update the index to the position after the completed word and delimiter
          const newSpokenIndex = state.lastSpokenIndex + wordBoundaryMatch.index + wordBoundaryMatch[0].length;
          setState(prev => ({ ...prev, lastSpokenIndex: newSpokenIndex }));
        }
      }
    }

    const isFinished = input.length >= challenge.text.length;
    const endTime = isFinished ? Date.now() : null;

    // Calculate WPM and accuracy
    const timeElapsed = (endTime || Date.now()) - (state.startTime || Date.now());
    const minutes = timeElapsed / 60000;
    const wordsTyped = input.length / 5; // Standard: 5 chars = 1 word
    const wpm = minutes > 0 ? Math.round(wordsTyped / minutes) : 0;

    let correctChars = 0;
    for (let i = 0; i < input.length; i++) {
      if (input[i] === challenge.text[i]) correctChars++;
    }
    const accuracy = input.length > 0 ? Math.round((correctChars / input.length) * 100) : 0;

    setState(prev => ({
      ...prev,
      currentInput: input,
      endTime,
      gameFinished: isFinished,
      wpm,
      accuracy,
    }));

    if (isFinished) {
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
      }).catch(err => console.error('Failed to submit score', err));
    }
  }, [state.dailyChallenge, state.gameStarted, state.gameFinished, state.startTime, state.lastSpokenIndex]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GetLeaderboardResponse = await res.json();
      setState(prev => ({ ...prev, leaderboard: data.leaderboard, showLeaderboard: true }));
    } catch (err) {
      console.error('Failed to fetch leaderboard', err);
    }
  }, []);

  const toggleLeaderboard = useCallback(() => {
    setState(prev => ({ ...prev, showLeaderboard: !prev.showLeaderboard }));
  }, []);

  const resetGame = useCallback(() => {
    setState(prev => ({
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
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
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
  };
};

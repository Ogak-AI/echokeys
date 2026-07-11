import { useCallback, useEffect, useState } from 'react';
import { context } from '../shims/devvit-web-client';
import { generateChallenge, getWeeklyLeaderboard, submitScore } from '../services/api';
import { DIFFICULTY_CONFIG } from '../../shared/types/index';
import type { ChallengeContentType, Difficulty, Language, LeaderboardEntry } from '../../shared/types/index';
import type { GameChallenge } from '../../shared/types/socket';

interface GameState {
  username: string | null;
  challenge: GameChallenge | null;
  loading: boolean;
  gameStarted: boolean;
  gameFinished: boolean;
  currentInput: string;
  startTime: number | null;
  endTime: number | null;
  wpm: number;
  accuracy: number;
  prompt: string;
  language: Language;
  contentType: ChallengeContentType;
  domain: string;
  difficulty: Difficulty;
  showSetup: boolean;
  timeLimitSeconds: number;
  timeLeftSeconds: number;
  lastSpokenIndex: number;
  isMuted: boolean;
  errorIndexes: number[];
  isGenerating: boolean;
  error: string | null;
  leaderboard: LeaderboardEntry[];
  scoreSummary: { score: number; weekly_rank: number | null; all_time_rank: number | null } | null;
}

export const useTypingGame = () => {
  const [state, setState] = useState<GameState>({
    username: null,
    challenge: null,
    loading: true,
    gameStarted: false,
    gameFinished: false,
    currentInput: '',
    startTime: null,
    endTime: null,
    wpm: 0,
    accuracy: 0,
    prompt: '',
    language: 'python',
    contentType: 'typing',
    domain: '',
    difficulty: 'easy',
    showSetup: true,
    timeLimitSeconds: DIFFICULTY_CONFIG.easy.timeLimitSeconds,
    timeLeftSeconds: DIFFICULTY_CONFIG.easy.timeLimitSeconds,
    lastSpokenIndex: 0,
    isMuted: false,
    errorIndexes: [],
    isGenerating: false,
    error: null,
    leaderboard: [],
    scoreSummary: null,
  });

  useEffect(() => {
    const username = context?.username || 'Player';
    setState((prev) => ({ ...prev, username, loading: false }));
    void loadLeaderboard();
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const response = await getWeeklyLeaderboard();
      setState((prev) => ({ ...prev, leaderboard: response.entries }));
    } catch (error) {
      console.error('Failed to load leaderboard', error);
    }
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
      endTime: null,
      errorIndexes: [],
      lastSpokenIndex: 0,
      scoreSummary: null,
      timeLimitSeconds: DIFFICULTY_CONFIG[prev.difficulty].timeLimitSeconds,
      timeLeftSeconds: DIFFICULTY_CONFIG[prev.difficulty].timeLimitSeconds,
    }));
  }, []);

  const generateChallengeForPrompt = useCallback(async () => {
    if (!state.prompt.trim()) {
      setState((prev) => ({ ...prev, error: 'Please enter a prompt to generate a challenge.' }));
      return;
    }

    setState((prev) => ({ ...prev, isGenerating: true, error: null, showSetup: false }));

    try {
      const response = await generateChallenge({
        concept: state.prompt.trim(),
        language: state.language,
        difficulty: state.difficulty,
        contentType: state.contentType,
        domain: state.domain.trim() || undefined,
      });

      setState((prev) => ({
        ...prev,
        challenge: {
          id: response.challenge.id,
          text: response.challenge.code,
          difficulty: response.challenge.difficulty,
          concept: response.challenge.concept,
          language: response.challenge.language,
          lineCount: response.challenge.line_count,
        },
        isGenerating: false,
        gameStarted: false,
        gameFinished: false,
        currentInput: '',
        startTime: null,
        endTime: null,
        wpm: 0,
        accuracy: 0,
        errorIndexes: [],
        lastSpokenIndex: 0,
        timeLimitSeconds: DIFFICULTY_CONFIG[state.difficulty].timeLimitSeconds,
        timeLeftSeconds: DIFFICULTY_CONFIG[state.difficulty].timeLimitSeconds,
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        isGenerating: false,
        error: error?.message || 'Challenge generation failed.',
        showSetup: true,
      }));
    }
  }, [state.prompt, state.language, state.difficulty, state.contentType, state.domain]);

  useEffect(() => {
    if (!state.gameStarted || state.gameFinished || state.timeLeftSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setState((prev) => {
        if (!prev.gameStarted || prev.gameFinished) return prev;

        if (prev.timeLeftSeconds <= 1) {
          if (prev.challenge && !prev.gameFinished) {
            void submitResult(prev.challenge.id, prev.wpm, prev.accuracy, prev.timeLimitSeconds, false);
          }

          return {
            ...prev,
            timeLeftSeconds: 0,
            gameFinished: true,
            endTime: Date.now(),
          };
        }

        return {
          ...prev,
          timeLeftSeconds: prev.timeLeftSeconds - 1,
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state.gameStarted, state.gameFinished, state.timeLeftSeconds, state.challenge, state.wpm, state.accuracy, state.timeLimitSeconds]);

  const updateInput = useCallback((input: string) => {
    const challenge = state.challenge;
    if (!challenge || !state.gameStarted || state.gameFinished) return;

    let currentSpokenIndex = state.lastSpokenIndex;

    if (input.length > currentSpokenIndex) {
      const textSinceLastSpoken = input.slice(currentSpokenIndex);
      const completedWords = textSinceLastSpoken.matchAll(/([\w']+)[\s.,!?;:\-—]/g);

      for (const match of completedWords) {
        const completedWord = match[1];
        if (completedWord && window.speechSynthesis && !state.isMuted) {
          const utterance = new SpeechSynthesisUtterance(completedWord);
          utterance.rate = 1.2;
          utterance.pitch = 1;
          window.speechSynthesis.speak(utterance);
        }
        currentSpokenIndex = currentSpokenIndex + (match.index ?? 0) + match[0].length;
      }
    }

    const isFinished = input.length >= challenge.text.length;
    const endTime = isFinished ? Date.now() : null;
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

    setState((prev) => {
      const next = {
        ...prev,
        currentInput: input,
        endTime,
        gameFinished: isFinished,
        wpm,
        accuracy,
        lastSpokenIndex: currentSpokenIndex,
        errorIndexes: newErrorIndexes,
        timeLeftSeconds: prev.timeLeftSeconds,
      };

      if (isFinished && !prev.gameFinished && prev.challenge) {
        void submitResult(prev.challenge.id, wpm, accuracy, Math.max(1, Math.round(timeElapsed / 1000)), true);
      }

      return next;
    });

    if (isFinished) {
      window.speechSynthesis.cancel();
    }
  }, [state.challenge, state.gameStarted, state.gameFinished, state.startTime, state.isMuted, state.lastSpokenIndex]);

  const submitResult = useCallback(async (challengeId: string, wpm: number, accuracy: number, timeSeconds: number, completed: boolean) => {
    try {
      const response = await submitScore({ challenge_id: challengeId, wpm, accuracy, time_seconds: timeSeconds, completed });
      setState((prev) => ({ ...prev, scoreSummary: response.score ? { score: response.score.score, weekly_rank: response.weekly_rank, all_time_rank: response.all_time_rank } : null }));
      await loadLeaderboard();
    } catch (error) {
      console.error('Score submission failed', error);
    }
  }, [loadLeaderboard]);

  const resetGame = useCallback(() => {
    window.speechSynthesis.cancel();
    setState((prev) => ({
      ...prev,
      challenge: null,
      gameStarted: false,
      gameFinished: false,
      currentInput: '',
      startTime: null,
      endTime: null,
      wpm: 0,
      accuracy: 0,
      showSetup: true,
      lastSpokenIndex: 0,
      isMuted: false,
      errorIndexes: [],
      scoreSummary: null,
      timeLimitSeconds: DIFFICULTY_CONFIG[prev.difficulty].timeLimitSeconds,
      timeLeftSeconds: DIFFICULTY_CONFIG[prev.difficulty].timeLimitSeconds,
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

  const updatePrompt = useCallback((prompt: string) => {
    setState((prev) => ({ ...prev, prompt }));
  }, []);

  const updateLanguage = useCallback((language: Language) => {
    setState((prev) => ({ ...prev, language }));
  }, []);

  const updateDifficulty = useCallback((difficulty: Difficulty) => {
    setState((prev) => ({
      ...prev,
      difficulty,
      timeLimitSeconds: DIFFICULTY_CONFIG[difficulty].timeLimitSeconds,
      timeLeftSeconds: prev.gameStarted ? DIFFICULTY_CONFIG[difficulty].timeLimitSeconds : prev.timeLeftSeconds,
    }));
  }, []);

  const updateContentType = useCallback((contentType: ChallengeContentType) => {
    setState((prev) => ({ ...prev, contentType }));
  }, []);

  const updateDomain = useCallback((domain: string) => {
    setState((prev) => ({ ...prev, domain }));
  }, []);

  return {
    ...state,
    startGame,
    generateChallenge: generateChallengeForPrompt,
    updatePrompt,
    updateLanguage,
    updateContentType,
    updateDomain,
    updateDifficulty,
    updateInput,
    resetGame,
    toggleMute,
    errorIndexes: state.errorIndexes,
  };
};

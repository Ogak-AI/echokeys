import { useState, useCallback, useRef, useEffect } from 'react';
import { calculateScore } from '../../shared/types/index';
import type { Challenge } from '../../shared/types/index';
import {
  MAX_INPUT_JUMP,
  MAX_WPM,
  THROTTLE_LOCK_MS,
  TIME_LIMIT_SECONDS,
  calculateAccuracy,
  calculateWpm,
  isSpeedViolation,
} from '../../shared/utils/antiCheat';

export interface TypingState {
  phase: 'idle' | 'playing' | 'finished' | 'timeout';
  input: string;
  wpm: number;
  accuracy: number;
  elapsed: number;
  remaining: number;
  progress: number;
  score: number;
  muted: boolean;
  throttled: boolean;
}

function elapsedSeconds(startedAt: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

/**
 * WPM time base aligned with server validation:
 * - first second: use fractional floor of 1 so live WPM is non-zero
 * - after that: integer seconds (matches submitted timeSeconds)
 */
function wpmTimeSeconds(startedAt: number): number {
  const sec = elapsedSeconds(startedAt);
  return Math.max(1, sec);
}

/** Split text into speech-friendly chunks (long utterances are unreliable). */
function speechChunks(text: string): string[] {
  const parts = text.match(/[^.!?\n]+[.!?\n]*|[^.!?\n]+$/g) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function cancelSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export function useTypingGame(challenge: Challenge | null) {
  const [state, setState] = useState<TypingState>({
    phase: 'idle',
    input: '',
    wpm: 0,
    accuracy: 100,
    elapsed: 0,
    remaining: TIME_LIMIT_SECONDS,
    progress: 0,
    score: 0,
    muted: false,
    throttled: false,
  });

  const t0 = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const isThrottledRef = useRef(false);
  const lastTypeAt = useRef(0);
  const lastLen = useRef(0);
  const inputRef = useRef('');
  const mutedRef = useRef(false);
  const phaseRef = useRef<TypingState['phase']>('idle');
  const challengeRef = useRef(challenge);
  /** True once we have queued narration for this race (user-gesture unlock). */
  const narrationStarted = useRef(false);

  useEffect(() => {
    challengeRef.current = challenge;
  }, [challenge]);

  useEffect(() => {
    inputRef.current = state.input;
    mutedRef.current = state.muted;
    phaseRef.current = state.phase;
  }, [state.input, state.muted, state.phase]);

  useEffect(() => {
    if (state.phase !== 'playing') return;
    timer.current = setInterval(() => {
      if (!t0.current) return;
      const sec = elapsedSeconds(t0.current);
      const rem = Math.max(0, TIME_LIMIT_SECONDS - sec);
      setState((p) => {
        if (rem <= 0 && p.phase === 'playing') {
          const wpm = calculateWpm(p.input.length, wpmTimeSeconds(t0.current));
          const score = calculateScore(p.accuracy / 100, wpm, sec);
          return { ...p, elapsed: sec, remaining: 0, wpm, score, phase: 'timeout' };
        }
        // Refresh live WPM as time passes even without new keystrokes
        const wpm = calculateWpm(p.input.length, wpmTimeSeconds(t0.current));
        const score = calculateScore(p.accuracy / 100, wpm, sec);
        return { ...p, elapsed: sec, remaining: rem, wpm, score };
      });
    }, 250);
    return () => clearInterval(timer.current);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'timeout' || state.phase === 'finished') {
      clearInterval(timer.current);
      cancelSpeech();
    }
  }, [state.phase]);

  const lockInput = useCallback((wpmHint?: number) => {
    isThrottledRef.current = true;
    setState((p) => ({
      ...p,
      throttled: true,
      ...(wpmHint != null ? { wpm: wpmHint } : {}),
    }));
    setTimeout(() => {
      isThrottledRef.current = false;
      lastTypeAt.current = Date.now();
      lastLen.current = inputRef.current.length;
      setState((p) => ({ ...p, throttled: false }));
    }, THROTTLE_LOCK_MS);
  }, []);

  /** Narrate challenge text from `fromIndex` (teleprompter voice-over). */
  const speakContent = useCallback((text: string, fromIndex = 0, force = false) => {
    if (!force && mutedRef.current) return;
    if (!window.speechSynthesis || !text) return;

    cancelSpeech();
    const remaining = text.slice(fromIndex).trim();
    if (!remaining) return;

    for (const chunk of speechChunks(remaining)) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = 0.95;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    }
  }, []);

  const start = useCallback(() => {
    t0.current = Date.now();
    isThrottledRef.current = false;
    lastTypeAt.current = Date.now();
    lastLen.current = 0;
    narrationStarted.current = false;
    setState((prev) => {
      // Best-effort start (often blocked until a user gesture / first keystroke)
      if (!prev.muted && challengeRef.current?.content) {
        queueMicrotask(() => {
          if (mutedRef.current) return;
          speakContent(challengeRef.current!.content, 0, true);
        });
      }
      return {
        phase: 'playing',
        input: '',
        wpm: 0,
        accuracy: 100,
        elapsed: 0,
        remaining: TIME_LIMIT_SECONDS,
        progress: 0,
        score: 0,
        muted: prev.muted,
        throttled: false,
      };
    });
  }, [speakContent]);

  const type = useCallback(
    (rawVal: string) => {
      if (!challenge || !t0.current || isThrottledRef.current || phaseRef.current !== 'playing') {
        return;
      }

      const val = rawVal.slice(0, challenge.content.length);
      const prev = inputRef.current;
      const diff = val.length - prev.length;

      if (diff > MAX_INPUT_JUMP) {
        lockInput();
        return;
      }

      const now = Date.now();
      const msDelta = now - lastTypeAt.current;
      const charsDelta = Math.max(0, val.length - lastLen.current);

      if (charsDelta > 0 && isSpeedViolation(charsDelta, msDelta)) {
        const burstWpm = calculateWpm(charsDelta, Math.max(msDelta / 1000, 0.001));
        lockInput(Math.min(burstWpm, MAX_WPM + 1));
        return;
      }

      lastTypeAt.current = now;
      lastLen.current = val.length;

      const text = challenge.content;

      // Browsers often require a keystroke before speechSynthesis works.
      // If auto-start narration was blocked, unlock it on first accepted input.
      if (
        !mutedRef.current &&
        !narrationStarted.current &&
        val.length > 0 &&
        text.length > 0
      ) {
        narrationStarted.current = true;
        const synth = window.speechSynthesis;
        const alreadySpeaking = Boolean(synth?.speaking || synth?.pending);
        if (!alreadySpeaking) {
          speakContent(text, 0, true);
        }
      }

      let ok = 0;
      for (let i = 0; i < val.length; i++) {
        if (val[i] === text[i]) ok++;
      }

      const sec = elapsedSeconds(t0.current);
      const wpm = calculateWpm(val.length, wpmTimeSeconds(t0.current));

      if (val.length >= 15 && wpm > MAX_WPM) {
        lockInput(wpm);
        return;
      }

      const accuracy = calculateAccuracy(ok, val.length);
      const progress = text.length
        ? Math.min(100, Math.round((val.length / text.length) * 100))
        : 0;
      const score = calculateScore(accuracy / 100, wpm, Math.max(sec, 1));
      const done = val.length >= text.length && text.length > 0;

      setState((p) => ({
        ...p,
        input: val,
        wpm,
        accuracy,
        progress,
        elapsed: sec,
        remaining: Math.max(0, TIME_LIMIT_SECONDS - sec),
        score,
        phase: done ? 'finished' : p.phase,
      }));

      if (done) cancelSpeech();
    },
    [challenge, lockInput, speakContent]
  );

  const toggleMute = useCallback(() => {
    setState((p) => {
      if (!p.muted) {
        cancelSpeech();
        return { ...p, muted: true };
      }
      // Unmute: narrate remaining content from current cursor
      const content = challengeRef.current?.content ?? '';
      narrationStarted.current = true;
      queueMicrotask(() => {
        speakContent(content, inputRef.current.length, true);
      });
      return { ...p, muted: false };
    });
  }, [speakContent]);

  const reset = useCallback(() => {
    clearInterval(timer.current);
    t0.current = 0;
    isThrottledRef.current = false;
    lastTypeAt.current = 0;
    lastLen.current = 0;
    narrationStarted.current = false;
    cancelSpeech();
    setState((prev) => ({
      phase: 'idle',
      input: '',
      wpm: 0,
      accuracy: 100,
      elapsed: 0,
      remaining: TIME_LIMIT_SECONDS,
      progress: 0,
      score: 0,
      muted: prev.muted,
      throttled: false,
    }));
  }, []);

  return { ...state, start, type, toggleMute, reset };
}

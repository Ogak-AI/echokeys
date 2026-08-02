import { useState, useCallback, useRef, useEffect } from 'react';
import { calculateScore } from '../../shared/types/index';
import type { Challenge } from '../../shared/types/index';
import {
  MAX_COMPOSITION_JUMP,
  MAX_INPUT_JUMP,
  MAX_WPM,
  THROTTLE_LOCK_MS,
  TIME_LIMIT_SECONDS,
  calculateAccuracy,
  calculateWpm,
  codePoints,
  countCorrectChars,
  countCorrectWords,
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
  /** Display composite only — leaderboard ranks by correctWords + time. */
  score: number;
  /** Fully correct words so far — primary ranking metric. */
  correctWords: number;
  muted: boolean;
  throttled: boolean;
  /** True while browser TTS is actively speaking the script. */
  speaking: boolean;
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

/**
 * Chrome (and some WebViews) pause speechSynthesis after ~15s unless resumed.
 * Keep a lightweight keep-alive while narration is expected.
 */
let resumeTimer: ReturnType<typeof setInterval> | undefined;

function startSpeechKeepAlive() {
  stopSpeechKeepAlive();
  resumeTimer = setInterval(() => {
    try {
      const s = window.speechSynthesis;
      if (s && (s.speaking || s.pending) && s.paused) {
        s.resume();
      }
    } catch {
      /* ignore */
    }
  }, 4000);
}

function stopSpeechKeepAlive() {
  if (resumeTimer != null) {
    clearInterval(resumeTimer);
    resumeTimer = undefined;
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
    correctWords: 0,
    muted: true, // require Read / Unmute before TTS
    throttled: false,
    speaking: false,
  });

  const t0 = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const isThrottledRef = useRef(false);
  const lastTypeAt = useRef(0);
  const lastLen = useRef(0);
  const inputRef = useRef('');
  const mutedRef = useRef(true);
  const phaseRef = useRef<TypingState['phase']>('idle');
  const challengeRef = useRef(challenge);
  /** True once we have queued narration for this race (user-gesture unlock). */
  const narrationStarted = useRef(false);
  /** Prevent stacking duplicate utterance queues. */
  const speakingRef = useRef(false);
  /** IME composition (CJK etc.) can insert multi-char clusters — do not treat as paste. */
  const composingRef = useRef(false);
  /** Inter-key intervals for optional bot-signal telemetry (client advisory). */
  const intervalsRef = useRef<number[]>([]);

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
        const scoreTime = Math.max(sec, 1);
        const content = challengeRef.current?.content ?? '';
        const correctWords = countCorrectWords(p.input, content);
        if (rem <= 0 && p.phase === 'playing') {
          const wpm = calculateWpm(Array.from(p.input).length, wpmTimeSeconds(t0.current));
          const score = calculateScore(p.accuracy / 100, wpm, scoreTime);
          return {
            ...p,
            elapsed: sec,
            remaining: 0,
            wpm,
            score,
            correctWords,
            phase: 'timeout',
          };
        }
        // Refresh live WPM as time passes even without new keystrokes
        const wpm = calculateWpm(Array.from(p.input).length, wpmTimeSeconds(t0.current));
        const score = calculateScore(p.accuracy / 100, wpm, scoreTime);
        return { ...p, elapsed: sec, remaining: rem, wpm, score, correctWords };
      });
    }, 250);
    return () => clearInterval(timer.current);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'timeout' || state.phase === 'finished') {
      clearInterval(timer.current);
      cancelSpeech();
      stopSpeechKeepAlive();
      speakingRef.current = false;
      setState((p) => (p.speaking ? { ...p, speaking: false } : p));
    }
  }, [state.phase]);

  useEffect(() => {
    return () => {
      cancelSpeech();
      stopSpeechKeepAlive();
    };
  }, []);

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
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;

    cancelSpeech();
    const remaining = text.slice(fromIndex).trim();
    if (!remaining) {
      speakingRef.current = false;
      setState((p) => (p.speaking ? { ...p, speaking: false } : p));
      stopSpeechKeepAlive();
      return;
    }

    const chunks = speechChunks(remaining);
    if (chunks.length === 0) return;

    speakingRef.current = true;
    setState((p) => ({ ...p, speaking: true }));
    startSpeechKeepAlive();

    let remainingUtterances = chunks.length;

    for (const chunk of chunks) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      u.onend = () => {
        remainingUtterances -= 1;
        if (remainingUtterances <= 0) {
          speakingRef.current = false;
          stopSpeechKeepAlive();
          setState((p) => (p.speaking ? { ...p, speaking: false } : p));
        }
      };
      u.onerror = () => {
        remainingUtterances -= 1;
        if (remainingUtterances <= 0) {
          speakingRef.current = false;
          stopSpeechKeepAlive();
          setState((p) => (p.speaking ? { ...p, speaking: false } : p));
        }
      };
      window.speechSynthesis.speak(u);
    }

    // Some engines start paused after cancel(); nudge resume.
    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * Ensure narration is running while the player types.
   * Safe to call from user gestures (tap/key) so mobile unlocks TTS.
   */
  const ensureNarration = useCallback(
    (fromIndex?: number) => {
      if (mutedRef.current) return;
      if (phaseRef.current !== 'playing' && phaseRef.current !== 'idle') return;
      const content = challengeRef.current?.content ?? '';
      if (!content) return;

      const startAt = fromIndex ?? inputRef.current.length;
      const synth = window.speechSynthesis;
      const alreadySpeaking = Boolean(synth?.speaking || synth?.pending);

      if (alreadySpeaking && narrationStarted.current) {
        // Keep alive if Chrome paused us mid-utterance.
        try {
          synth?.resume();
        } catch {
          /* ignore */
        }
        return;
      }

      narrationStarted.current = true;
      speakContent(content, startAt, true);
    },
    [speakContent]
  );

  const start = useCallback(() => {
    t0.current = Date.now();
    isThrottledRef.current = false;
    lastTypeAt.current = Date.now();
    lastLen.current = 0;
    composingRef.current = false;
    intervalsRef.current = [];
    narrationStarted.current = false;
    speakingRef.current = false;
    setState((prev) => {
      // Best-effort start (often blocked until a user gesture / first keystroke)
      if (!prev.muted && challengeRef.current?.content) {
        queueMicrotask(() => {
          if (mutedRef.current) return;
          // Mark attempt; ensureNarration on first key/tap will re-fire if blocked.
          speakContent(challengeRef.current!.content, 0, true);
          narrationStarted.current = true;
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
        correctWords: 0,
        muted: prev.muted,
        throttled: false,
        speaking: false,
      };
    });
  }, [speakContent]);

  const setComposing = useCallback((active: boolean) => {
    composingRef.current = active;
  }, []);

  const type = useCallback(
    (rawVal: string) => {
      if (!challenge || !t0.current || isThrottledRef.current || phaseRef.current !== 'playing') {
        return;
      }

      // Cap by code-unit length to match stored content bounds (same as server sanitize).
      const val = rawVal.slice(0, challenge.content.length);
      const prev = inputRef.current;
      // Jump detection uses Unicode code points so emoji surrogates cannot bypass paste locks.
      const prevPoints = codePoints(prev).length;
      const valPoints = codePoints(val).length;
      const jump = valPoints - prevPoints;
      const maxJump = composingRef.current ? MAX_COMPOSITION_JUMP : MAX_INPUT_JUMP;

      // Paste / bulk insert / synthetic composition: hard-cap single-update growth.
      // MAX_COMPOSITION_JUMP still applies during IME so compositionstart cannot dump a full paste.
      if (jump > maxJump) {
        setState((p) => ({ ...p, input: prev }));
        lockInput();
        return;
      }

      const now = Date.now();
      const msDelta = now - lastTypeAt.current;
      const charsDelta = Math.max(0, valPoints - lastLen.current);

      // During IME composition, skip burst speed locks (commit is multi-char by design).
      // Jump size is still capped above; speed is re-checked on compositionend.
      if (
        charsDelta > 0 &&
        !composingRef.current &&
        isSpeedViolation(charsDelta, msDelta)
      ) {
        const burstWpm = calculateWpm(charsDelta, Math.max(msDelta / 1000, 0.001));
        setState((p) => ({ ...p, input: prev }));
        lockInput(Math.min(burstWpm, MAX_WPM + 1));
        return;
      }

      if (charsDelta > 0 && lastTypeAt.current > 0) {
        const intervals = intervalsRef.current;
        intervals.push(msDelta);
        if (intervals.length > 64) intervals.shift();
      }

      lastTypeAt.current = now;
      lastLen.current = valPoints;

      const text = challenge.content;

      // Browsers often require a keystroke before speechSynthesis works.
      // If auto-start narration was blocked, unlock it on first accepted input.
      // Continue reading remaining text while the user types (do not cancel on each key).
      if (!mutedRef.current && val.length > 0 && text.length > 0) {
        const synth = window.speechSynthesis;
        const alreadySpeaking = Boolean(synth?.speaking || synth?.pending);
        if (!narrationStarted.current || !alreadySpeaking) {
          // Start from the beginning once so the full script is heard while typing.
          // If speech died mid-race, resume from the current cursor so it stays useful.
          const from = narrationStarted.current ? val.length : 0;
          narrationStarted.current = true;
          speakContent(text, from, true);
        } else {
          try {
            synth?.resume();
          } catch {
            /* ignore */
          }
        }
      }

      // Same correctness rules as server validatePlayMetrics / countCorrectChars.
      // Metrics use Unicode code points so emoji / surrogates match the server.
      const typedPoints = Array.from(val).length;
      const contentPoints = Array.from(text).length;
      const ok = countCorrectChars(val, text);
      const correctWords = countCorrectWords(val, text);
      const sec = elapsedSeconds(t0.current);
      const wpm = calculateWpm(typedPoints, wpmTimeSeconds(t0.current));

      if (typedPoints >= 15 && wpm > MAX_WPM) {
        setState((p) => ({ ...p, input: prev }));
        lockInput(wpm);
        return;
      }

      // Live display score always uses at least 1s so it matches server floor.
      // Ranking uses correctWords + timeSeconds, not this composite.
      const scoreTime = Math.max(sec, 1);
      const accuracy = calculateAccuracy(ok, typedPoints);
      const progress = contentPoints
        ? Math.min(100, Math.round((typedPoints / contentPoints) * 100))
        : 0;
      const score = calculateScore(accuracy / 100, wpm, scoreTime);
      const done = typedPoints >= contentPoints && contentPoints > 0;

      setState((p) => ({
        ...p,
        input: val,
        wpm,
        accuracy,
        progress,
        elapsed: sec,
        remaining: Math.max(0, TIME_LIMIT_SECONDS - sec),
        score,
        correctWords,
        phase: done ? 'finished' : p.phase,
      }));

      if (done) {
        cancelSpeech();
        stopSpeechKeepAlive();
        speakingRef.current = false;
      }
    },
    [challenge, lockInput, speakContent]
  );

  const toggleMute = useCallback(() => {
    setState((p) => {
      if (!p.muted) {
        cancelSpeech();
        stopSpeechKeepAlive();
        speakingRef.current = false;
        return { ...p, muted: true, speaking: false };
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

  /** Explicit "Read" action — restarts narration from the live cursor. */
  const readAloud = useCallback(() => {
    if (mutedRef.current) {
      // Unmute + read
      setState((p) => ({ ...p, muted: false }));
      mutedRef.current = false;
    }
    const content = challengeRef.current?.content ?? '';
    if (!content) return;
    narrationStarted.current = true;
    speakContent(content, inputRef.current.length, true);
  }, [speakContent]);

  const reset = useCallback(() => {
    clearInterval(timer.current);
    t0.current = 0;
    isThrottledRef.current = false;
    lastTypeAt.current = 0;
    lastLen.current = 0;
    composingRef.current = false;
    intervalsRef.current = [];
    narrationStarted.current = false;
    speakingRef.current = false;
    cancelSpeech();
    stopSpeechKeepAlive();
    setState((prev) => ({
      phase: 'idle',
      input: '',
      wpm: 0,
      accuracy: 100,
      elapsed: 0,
      remaining: TIME_LIMIT_SECONDS,
      progress: 0,
      score: 0,
      correctWords: 0,
      muted: prev.muted,
      throttled: false,
      speaking: false,
    }));
  }, []);

  /** Snapshot of inter-key intervals for optional server bot telemetry. */
  const getKeyIntervals = useCallback((): number[] => {
    return intervalsRef.current.slice();
  }, []);

  return {
    ...state,
    start,
    type,
    setComposing,
    getKeyIntervals,
    toggleMute,
    readAloud,
    ensureNarration,
    reset,
  };
}

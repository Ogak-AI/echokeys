import { useState, useCallback, useRef, useEffect } from 'react';
import { calculateScore } from '../../shared/types/index';
import type { Challenge } from '../../shared/types/index';

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

export function useTypingGame(challenge: Challenge | null) {
  const [state, setState] = useState<TypingState>({
    phase: 'idle', input: '', wpm: 0, accuracy: 100,
    elapsed: 0, remaining: 0, progress: 0, score: 0, muted: false, throttled: false,
  });

  const t0 = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const spokenIdx = useRef(0);
  const isThrottledRef = useRef(false);

  const limit = 600;

  useEffect(() => {
    if (state.phase !== 'playing') return;
    timer.current = setInterval(() => {
      const sec = Math.floor((Date.now() - t0.current) / 1000);
      const rem = Math.max(0, limit - sec);
      setState(p => {
        if (rem <= 0 && p.phase === 'playing') return { ...p, elapsed: sec, remaining: 0, phase: 'timeout' };
        return { ...p, elapsed: sec, remaining: rem };
      });
    }, 250);
    return () => clearInterval(timer.current);
  }, [state.phase, limit]);

  useEffect(() => {
    if (state.phase === 'timeout' || state.phase === 'finished') {
      clearInterval(timer.current);
      window.speechSynthesis?.cancel();
    }
  }, [state.phase]);

  const start = useCallback(() => {
    t0.current = Date.now();
    spokenIdx.current = 0;
    isThrottledRef.current = false;
    setState({ phase: 'playing', input: '', wpm: 0, accuracy: 100, elapsed: 0, remaining: limit, progress: 0, score: 0, muted: false, throttled: false });
  }, [limit]);

  const type = useCallback((val: string) => {
    if (!challenge || !t0.current || isThrottledRef.current || state.phase !== 'playing') return;

    // Paste protection: if input jump is more than 5 characters, throttle immediately
    const diff = val.length - state.input.length;
    if (diff > 5) {
      isThrottledRef.current = true;
      setState(p => ({ ...p, throttled: true }));
      setTimeout(() => {
        isThrottledRef.current = false;
        setState(p => ({ ...p, throttled: false }));
      }, 1500);
      return;
    }

    const text = challenge.content;

    // Audio pronunciation only for correctly typed words
    if (val.length > spokenIdx.current && !state.muted) {
      const chunk = val.slice(spokenIdx.current);
      for (const m of chunk.matchAll(/([a-zA-Z_]\w*)\W/g)) {
        if (m[1] && window.speechSynthesis) {
          const wordStart = spokenIdx.current + (m.index ?? 0);
          const wordEnd = wordStart + m[1].length;
          const userWord = val.slice(wordStart, wordEnd);
          const challengeWord = text.slice(wordStart, wordEnd);

          if (userWord === challengeWord) {
            const u = new SpeechSynthesisUtterance(m[1]);
            u.rate = 1.3;
            u.pitch = 1;
            window.speechSynthesis.speak(u);
          }
        }
        spokenIdx.current += (m.index ?? 0) + m[0].length;
      }
    }

    let ok = 0;
    for (let i = 0; i < val.length; i++) { if (val[i] === text[i]) ok++; }
    const mins = (Date.now() - t0.current) / 60000;
    const wpm = mins > 0 ? Math.round((val.length / 5) / mins) : 0;

    // Speed throttle: 7 WPS is 420 WPM. Check after 15 chars to ignore initial spikes.
    if (val.length >= 15 && wpm > 420) {
      isThrottledRef.current = true;
      setState(p => ({ ...p, throttled: true, wpm }));
      setTimeout(() => {
        isThrottledRef.current = false;
        setState(p => ({ ...p, throttled: false }));
      }, 1500);
      return;
    }

    const accuracy = val.length > 0 ? Math.round((ok / val.length) * 100) : 100;
    const progress = Math.min(100, Math.round((val.length / text.length) * 100));
    const sec = Math.floor((Date.now() - t0.current) / 1000);
    const score = calculateScore(accuracy / 100, wpm, sec);
    const done = val.length >= text.length;

    setState(p => ({
      ...p, input: val, wpm, accuracy, progress,
      elapsed: sec, remaining: Math.max(0, limit - sec),
      score, phase: done ? 'finished' : p.phase,
    }));
    if (done) window.speechSynthesis?.cancel();
  }, [challenge, limit, state.input, state.muted, state.phase]);

  const toggleMute = useCallback(() => {
    setState(p => { if (!p.muted) window.speechSynthesis?.cancel(); return { ...p, muted: !p.muted }; });
  }, []);

  const reset = useCallback(() => {
    clearInterval(timer.current);
    t0.current = 0;
    spokenIdx.current = 0;
    isThrottledRef.current = false;
    window.speechSynthesis?.cancel();
    setState({ phase: 'idle', input: '', wpm: 0, accuracy: 100, elapsed: 0, remaining: limit, progress: 0, score: 0, muted: false, throttled: false });
  }, [limit]);

  return { ...state, start, type, toggleMute, reset };
}

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useTypingGame } from '../hooks/useTypingGame';
import type { Challenge, ContentDomain } from '../../shared/types/index';
import { DOMAIN_COLORS } from '../../shared/types/index';
import { context } from '../shims/devvit-web-client';

type Results = {
  score: number;
  wpm: number;
  accuracy: number;
  weeklyRank: number | null;
  allTimeRank: number | null;
  wordsTyped: number;
  correctWords: number;
  timeSeconds: number;
  ranked: boolean;
};

/** Guard against React StrictMode double-submits in development. */
const submittedKeys = new Set<string>();

/** Vertical focus band for the current char (fraction of teleprompter height). */
const FOCUS_BAND = 0.32;

function resetDocumentScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  // visualViewport offset can leave the page "scrolled" under a keyboard
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  } catch {
    window.scrollTo(0, 0);
  }
}

export const App = () => {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [fromPost, setFromPost] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState(context?.username ?? 'Player');
  const [subredditName, setSubredditName] = useState('');
  const [textOffsetY, setTextOffsetY] = useState(0);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [raceError, setRaceError] = useState<string | null>(null);
  const [raceStarting, setRaceStarting] = useState(false);
  const [kbReady, setKbReady] = useState(false);
  const [kbWordCount, setKbWordCount] = useState(0);
  const [kbError, setKbError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const teleprompterRef = useRef<HTMLDivElement>(null);
  const textTrackRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const textOffsetYRef = useRef(0);
  const autoStartedId = useRef<string | null>(null);
  const raceStartedFor = useRef<string | null>(null);
  const raceIdRef = useRef<string | null>(null);
  const phaseRef = useRef<'idle' | 'playing' | 'finished' | 'timeout'>('idle');
  const throttledRef = useRef(false);
  const inputRef = useRef('');
  const submitInFlight = useRef(false);

  const {
    phase,
    input,
    wpm,
    accuracy,
    remaining,
    progress,
    correctWords,
    elapsed,
    muted,
    throttled,
    speaking,
    start,
    type,
    toggleMute,
    readAloud,
    ensureNarration,
    reset,
  } = useTypingGame(challenge);

  useEffect(() => {
    phaseRef.current = phase;
    throttledRef.current = throttled;
  }, [phase, throttled]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    raceIdRef.current = raceId;
  }, [raceId]);

  const isPlaying = phase === 'playing' || phase === 'idle';
  const isEnded = phase === 'finished' || phase === 'timeout';

  /** Open a server race session so score time is server-authoritative. */
  const beginRace = useCallback(async (challengeId: string) => {
    if (raceStartedFor.current === challengeId && raceIdRef.current) {
      return raceIdRef.current;
    }
    setRaceError(null);
    setRaceStarting(true);
    try {
      const res = await fetch('/api/race/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start race');
      }
      raceStartedFor.current = challengeId;
      raceIdRef.current = data.raceId as string;
      setRaceId(data.raceId as string);
      return data.raceId as string;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start race';
      console.error('[Game] Race start error:', err);
      setRaceError(message);
      setRaceId(null);
      raceIdRef.current = null;
      raceStartedFor.current = null;
      return null;
    } finally {
      setRaceStarting(false);
    }
  }, []);

  /**
   * Server race must exist before the client clock starts so WPM/time cannot
   * diverge (typing before race/start would under-count server duration).
   */
  const startChallengeRace = useCallback(
    async (next: Challenge) => {
      if (autoStartedId.current === next.id && raceIdRef.current) return;
      autoStartedId.current = next.id;
      const id = await beginRace(next.id);
      if (!id) {
        // beginRace already set raceError for the start-failure screen.
        autoStartedId.current = null;
        return;
      }
      start();
    },
    [beginRace, start]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [meRes, postRes, kbRes] = await Promise.all([
          fetch('/api/me'),
          fetch('/api/post/challenge'),
          fetch('/api/knowledge-base'),
        ]);
        if (meRes.ok) {
          const me = await meRes.json();
          if (!cancelled) {
            if (me.username) setUsername(me.username);
            if (me.subredditName) setSubredditName(me.subredditName);
          }
        }
        if (postRes.ok) {
          const data = await postRes.json();
          if (!cancelled && data.challenge) {
            setChallenge(data.challenge as Challenge);
            setFromPost(true);
          }
        }
        if (kbRes.ok) {
          const kb = await kbRes.json();
          if (!cancelled) {
            setKbReady(Boolean(kb.ready));
            setKbWordCount(typeof kb.wordCount === 'number' ? kb.wordCount : 0);
            setKbError(typeof kb.error === 'string' ? kb.error : null);
          }
        }
      } catch (err) {
        console.error('[Game] Failed to load post challenge:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (challenge && phase === 'idle' && autoStartedId.current !== challenge.id) {
      void startChallengeRace(challenge);
    }
  }, [challenge, phase, startChallengeRace]);

  /**
   * Fit the game shell to the *visible* viewport (keyboard-safe on phones).
   * Without this, mobile browsers push the focused input and users must scroll
   * up to see the challenge text they are supposed to type.
   */
  const fitShellToVisibleViewport = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const vv = window.visualViewport;
    if (vv) {
      const h = Math.max(0, Math.round(vv.height));
      const top = Math.round(vv.offsetTop);
      shell.style.height = `${h}px`;
      shell.style.maxHeight = `${h}px`;
      shell.style.transform = top ? `translateY(${top}px)` : '';
    } else {
      shell.style.height = '';
      shell.style.maxHeight = '';
      shell.style.transform = '';
    }
    resetDocumentScroll();
  }, []);

  /**
   * Lock the current character to a fixed focus band.
   * Uses transform (not scroll) so users never need to scroll to see what to type next.
   */
  const lockCursorInView = useCallback(() => {
    const container = teleprompterRef.current;
    const track = textTrackRef.current;
    const cursor = cursorRef.current;
    if (!container || !track || !cursor) return;

    const focusY = container.clientHeight * FOCUS_BAND;
    // Both rects include the same translateY, so the delta is transform-invariant
    // and equals the cursor's Y inside the track content.
    const trackRect = track.getBoundingClientRect();
    const cursorRect = cursor.getBoundingClientRect();
    const cursorYInTrack = cursorRect.top - trackRect.top;
    const next = focusY - cursorYInTrack - cursorRect.height / 2;

    if (Math.abs(next - textOffsetYRef.current) > 0.5) {
      textOffsetYRef.current = next;
      setTextOffsetY(next);
    }
  }, []);

  const focusCapture = useCallback(() => {
    if (throttled) return;
    textareaRef.current?.focus({ preventScroll: true });
    resetDocumentScroll();
    fitShellToVisibleViewport();
    requestAnimationFrame(() => {
      lockCursorInView();
      resetDocumentScroll();
    });
  }, [throttled, fitShellToVisibleViewport, lockCursorInView]);

  useEffect(() => {
    if (phase === 'playing' && !throttled) {
      focusCapture();
    }
  }, [phase, throttled, challenge?.id, focusCapture]);

  useLayoutEffect(() => {
    if (!isPlaying) return;
    lockCursorInView();
  }, [input, phase, challenge?.id, isPlaying, lockCursorInView]);

  // Re-lock when the viewport changes (keyboard open, rotate, resize).
  useEffect(() => {
    if (!isPlaying) return;

    const onViewportChange = () => {
      fitShellToVisibleViewport();
      // Double-rAF: wait for keyboard / layout to settle, then re-measure.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          lockCursorInView();
          resetDocumentScroll();
        })
      );
    };

    fitShellToVisibleViewport();
    onViewportChange();

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);

    // Hard-block page scroll while racing — text moves under a fixed focus band.
    const blockScroll = (e: Event) => {
      e.preventDefault();
      resetDocumentScroll();
    };
    const onWindowScroll = () => resetDocumentScroll();

    window.addEventListener('scroll', onWindowScroll, { passive: true });
    document.addEventListener('touchmove', blockScroll, { passive: false });
    document.documentElement.classList.add('ek-lock-scroll');
    document.body.classList.add('ek-lock-scroll');

    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('scroll', onWindowScroll);
      document.removeEventListener('touchmove', blockScroll);
      document.documentElement.classList.remove('ek-lock-scroll');
      document.body.classList.remove('ek-lock-scroll');
      const shell = shellRef.current;
      if (shell) {
        shell.style.height = '';
        shell.style.maxHeight = '';
        shell.style.transform = '';
      }
    };
  }, [isPlaying, fitShellToVisibleViewport, lockCursorInView]);

  const submitResults = useCallback(async () => {
    if (!challenge || phase === 'idle' || phase === 'playing') return;
    if (submitInFlight.current) return;

    const typed = inputRef.current;
    if (!typed) {
      setError('Nothing typed — score not submitted');
      return;
    }

    // Never mint a fresh race after typing is done — that would reset the
    // server clock and either reject as impossible speed or inflate WPM.
    const activeRaceId = raceIdRef.current;
    if (!activeRaceId) {
      setError(
        'Race session missing — use Retry to start a new attempt (scores need a live race clock).'
      );
      return;
    }

    const key = `${challenge.id}:${activeRaceId}:${typed.length}`;
    if (submittedKeys.has(key)) return;
    submittedKeys.add(key);

    submitInFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/score/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.id,
          raceId: activeRaceId,
          typed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit score');

      // Race is one-shot after a successful claim.
      raceIdRef.current = null;
      raceStartedFor.current = null;
      setRaceId(null);

      setResults({
        score: data.score.score,
        wpm: data.score.wpm,
        accuracy: data.score.accuracy,
        weeklyRank: data.weeklyRank,
        allTimeRank: data.allTimeRank,
        wordsTyped: data.score.wordsTyped ?? 0,
        correctWords: data.score.correctWords ?? 0,
        timeSeconds: data.score.timeSeconds ?? 0,
        ranked: data.ranked !== false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submit failed';
      console.error('Submit score error:', err);
      setError(message);
      submittedKeys.delete(key);

      // Keep raceId on transient/network failures so Retry reuses the same clock.
      // Clear only when the server says the session is gone/claimed.
      if (/not found|already used|already claimed|expired|does not belong|does not match/i.test(message)) {
        raceIdRef.current = null;
        raceStartedFor.current = null;
        setRaceId(null);
      }
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }, [challenge, phase]);

  useEffect(() => {
    if (phase === 'finished' || phase === 'timeout') {
      void submitResults();
    }
  }, [phase, submitResults]);

  const applyNewChallenge = useCallback(
    (challengeData: Challenge) => {
      // Fresh challenge → fresh race clock; never reuse a prior raceId.
      setFromPost(false);
      autoStartedId.current = null;
      raceStartedFor.current = null;
      raceIdRef.current = null;
      setRaceId(null);
      submitInFlight.current = false;
      submittedKeys.clear();
      reset();
      setChallenge(challengeData);
    },
    [reset]
  );

  /** Start a free-play race: server picks a random excerpt from the knowledge base. */
  const startRandomRace = useCallback(async () => {
    setCreating(true);
    setError(null);
    setRaceError(null);
    try {
      const res = await fetch('/api/challenge/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start race');
      applyNewChallenge(data.challenge as Challenge);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start race');
    } finally {
      setCreating(false);
    }
  }, [applyNewChallenge]);

  const handleBack = () => {
    window.location.href = 'splash.html';
  };

  const handleTryAgain = () => {
    setResults(null);
    setError(null);
    setRaceError(null);
    raceIdRef.current = null;
    raceStartedFor.current = null;
    setRaceId(null);
    submitInFlight.current = false;
    submittedKeys.clear();
    if (fromPost && challenge) {
      autoStartedId.current = null;
      reset();
      return;
    }
    autoStartedId.current = null;
    setChallenge(null);
    reset();
  };

  const handleRetryRaceStart = () => {
    if (!challenge) return;
    setError(null);
    setRaceError(null);
    autoStartedId.current = null;
    void startChallengeRace(challenge);
  };

  const renderCodeChars = () => {
    if (!challenge) return null;
    const content = challenge.content;
    const domainColor = DOMAIN_COLORS[challenge.domain as ContentDomain] ?? '#d4d4d4';

    return content.split('').map((char, idx) => {
      let className = 'ch-pending';
      let style: React.CSSProperties | undefined;
      let ref: React.RefObject<HTMLSpanElement | null> | undefined;

      if (idx < input.length) {
        className = input[idx] === char ? 'ch-correct' : 'ch-error';
      } else if (idx === input.length) {
        className = 'ch-cursor';
        ref = cursorRef;
      } else if (challenge.domain === 'code') {
        style = { color: domainColor, opacity: 0.72 };
      }

      return (
        <span key={idx} ref={ref} className={className} style={style}>
          {char === '\n' ? '↵\n' : char === ' ' ? '\u00a0' : char}
        </span>
      );
    });
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const communityLabel = subredditName
    ? subredditName.startsWith('r/')
      ? subredditName
      : `r/${subredditName}`
    : '';

  if (loading || creating || (challenge && phase === 'idle' && raceStarting)) {
    return (
      <div className="app-shell app-center" style={{ gap: '0.65rem' }}>
        <div className="spinner" />
        <p className="loading-text">
          {creating ? 'Creating…' : raceStarting ? 'Starting race…' : 'Loading…'}
        </p>
      </div>
    );
  }

  // Race session failed before typing could begin.
  if (challenge && phase === 'idle' && (raceError || error) && !raceId) {
    return (
      <div className="app-shell app-center">
        <div className="vsc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-vsc-accent)' }}>
            Could not start race
          </h2>
          <div className="alert-error">{raceError || error}</div>
          <button type="button" className="vsc-btn vsc-btn-lg" style={{ width: '100%' }} onClick={handleRetryRaceStart}>
            Retry start
          </button>
          <button type="button" className="vsc-btn vsc-btn-ghost" style={{ width: '100%' }} onClick={handleTryAgain}>
            {fromPost ? 'Back' : 'New race'}
          </button>
        </div>
      </div>
    );
  }

  // Always show end-of-race shell when finished/timeout so upload errors stay reachable.
  if (results || isEnded || submitting) {
    return (
      <div className="app-shell app-center">
        <div className="vsc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ textAlign: 'center' }}>
            <h2
              style={{
                fontSize: 'clamp(1.05rem, 4vw, 1.25rem)',
                fontWeight: 700,
                color: 'var(--color-vsc-green)',
              }}
            >
              {phase === 'timeout' ? "Time's Up" : 'Complete'}
            </h2>
            {communityLabel && (
              <p className="mono muted" style={{ fontSize: '0.625rem', marginTop: '0.15rem' }}>
                {communityLabel}
              </p>
            )}
          </div>

          {submitting && !results ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0' }}>
              <div className="spinner" />
              <p className="muted" style={{ fontSize: '0.6875rem' }}>Uploading…</p>
            </div>
          ) : results ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                <div className="stat-box">
                  <div className="stat-val stat-val-green">
                    {results.correctWords.toLocaleString()}
                  </div>
                  <div className="stat-lbl">Correct words</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val">{results.timeSeconds}s</div>
                  <div className="stat-lbl">Time</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val">{results.wpm}</div>
                  <div className="stat-lbl">WPM</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val">{results.accuracy}%</div>
                  <div className="stat-lbl">Accuracy</div>
                </div>
              </div>
              <div
                className="mono muted"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.625rem',
                  gap: '0.5rem',
                }}
              >
                <span>
                  Weekly {results.weeklyRank ? `#${results.weeklyRank}` : '—'} · All-time{' '}
                  {results.allTimeRank ? `#${results.allTimeRank}` : '—'}
                </span>
                <span>{results.wordsTyped.toLocaleString()} typed</span>
              </div>
              {!results.ranked && (
                <p className="mono muted" style={{ fontSize: '0.625rem', textAlign: 'center' }}>
                  Partial run saved — needs 50%+ progress to rank on the board
                </p>
              )}
            </>
          ) : (
            <div className="mono muted" style={{ fontSize: '0.6875rem', textAlign: 'center' }}>
              Live: {correctWords} correct · {elapsed > 0 ? `${elapsed}s` : '0s'} · {wpm} WPM ·{' '}
              {accuracy}%
            </div>
          )}

          {error && (
            <div className="alert-error">
              {error}
              <button
                type="button"
                className="vsc-btn vsc-btn-sm"
                style={{ display: 'block', marginTop: '0.4rem' }}
                onClick={() => {
                  submittedKeys.clear();
                  void submitResults();
                }}
              >
                Retry upload
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-lg" style={{ width: '100%' }}>
              {fromPost ? 'Retry' : 'New race'}
            </button>
            <button
              onClick={() => {
                window.location.href = 'leaderboard.html';
              }}
              className="vsc-btn vsc-btn-ghost"
              style={{ width: '100%' }}
            >
              Leaderboard
            </button>
            <button onClick={handleBack} className="vsc-btn vsc-btn-ghost vsc-btn-sm" style={{ width: '100%' }}>
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (challenge && isPlaying) {
    const readLabel = muted ? 'Read' : speaking ? 'Reading…' : 'Read';

    return (
      <div className="app-shell app-shell-game" ref={shellRef}>
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
            <span className="app-header-title">Echokeys</span>
            <span
              className="chip"
              style={{ color: DOMAIN_COLORS[challenge.domain], flexShrink: 0 }}
            >
              {challenge.domain}
            </span>
            {communityLabel && (
              <span className="mono muted truncate" style={{ fontSize: '0.625rem' }}>
                {communityLabel}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
            <button
              onClick={() => {
                readAloud();
                focusCapture();
              }}
              className="vsc-btn vsc-btn-ghost vsc-btn-sm"
              type="button"
              aria-label="Read challenge text aloud"
              title="Read the challenge text aloud while you type"
            >
              {readLabel}
            </button>
            <button
              onClick={() => {
                toggleMute();
                focusCapture();
              }}
              className="vsc-btn vsc-btn-ghost vsc-btn-sm"
              type="button"
              aria-label={muted ? 'Unmute narration' : 'Mute narration'}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">
              Reset
            </button>
          </div>
        </header>

        <div className="game-layout">
          <div className="game-editor-col">
            <div className="editor-panel teleprompter-panel">
              <div className="editor-titlebar">
                <span className="truncate">
                  Teleprompter — {username}
                  {challenge.prompt
                    ? ` · ${challenge.prompt.slice(0, 40)}${challenge.prompt.length > 40 ? '…' : ''}`
                    : ''}
                </span>
                <span className="mono muted" style={{ fontSize: '0.625rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                  {muted ? 'Muted' : speaking ? 'Reading aloud' : 'Tap Read or type to hear'}
                </span>
              </div>

              <div
                className="teleprompter"
                ref={teleprompterRef}
                onPointerDown={(e) => {
                  // Keep focus on the capture field without browser scroll-jumping.
                  e.preventDefault();
                  // User gesture unlocks speechSynthesis on mobile / WebViews.
                  // Start from the beginning only if nothing typed yet; else resume remaining.
                  ensureNarration(input.length > 0 ? input.length : 0);
                  focusCapture();
                }}
                role="presentation"
              >
                {/* Fixed focus band: current char always sits here */}
                <div className="teleprompter-focus-band" aria-hidden />
                <div className="teleprompter-fade teleprompter-fade-top" aria-hidden />
                <div className="teleprompter-fade teleprompter-fade-bottom" aria-hidden />

                <div
                  className="teleprompter-text"
                  ref={textTrackRef}
                  style={{ transform: `translate3d(0, ${textOffsetY}px, 0)` }}
                >
                  {renderCodeChars()}
                  {input.length >= challenge.content.length && (
                    <span ref={cursorRef} className="ch-cursor">
                      {' '}
                    </span>
                  )}
                </div>

                {/*
                  Capture field sits on the focus band (not off-screen).
                  Mobile browsers scroll focused inputs into view — keeping it
                  here prevents the "scroll up to read / down to type" jump.
                */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    type(e.target.value);
                    // Keep the next character locked after every keystroke.
                    requestAnimationFrame(lockCursorInView);
                  }}
                  onPaste={(e) => {
                    // Paste is never a valid typing path.
                    e.preventDefault();
                  }}
                  onDrop={(e) => e.preventDefault()}
                  onFocus={(e) => {
                    // Stop browser from scrolling the field into a different place.
                    e.preventDefault();
                    resetDocumentScroll();
                    fitShellToVisibleViewport();
                    requestAnimationFrame(lockCursorInView);
                  }}
                  onBlur={() => {
                    // Re-focus so soft keyboard stays up on mobile (unless finished).
                    setTimeout(() => {
                      if (phaseRef.current === 'playing' && !throttledRef.current) {
                        textareaRef.current?.focus({ preventScroll: true });
                        resetDocumentScroll();
                      }
                    }, 0);
                  }}
                  disabled={throttled || !raceId}
                  className="teleprompter-capture"
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  inputMode="text"
                  enterKeyHint="enter"
                  aria-label="Type the teleprompter text"
                  tabIndex={0}
                />
              </div>
            </div>

            {throttled && (
              <div className="alert-warn">
                Locked 1.5s — max 7 words/sec
              </div>
            )}
          </div>

          <aside className="game-aside">
            <div className="game-timer-row">
              <div>
                <div className="stat-lbl" style={{ marginTop: 0 }}>
                  Time
                </div>
                <div
                  className={`timer-display ${
                    remaining < 30 ? 'timer-danger' : remaining < 60 ? 'timer-warn' : ''
                  }`}
                >
                  {formatTime(remaining)}
                </div>
              </div>
              <div className="game-progress-wrap">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="mono muted" style={{ fontSize: '0.5625rem', marginTop: '0.2rem', textAlign: 'right' }}>
                  {progress}%
                </p>
              </div>
            </div>

            <div className="game-stats-row">
              <div className="stat-box">
                <div className="stat-val stat-val-accent">{correctWords}</div>
                <div className="stat-lbl">Correct</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{elapsed > 0 ? `${elapsed}s` : '0s'}</div>
                <div className="stat-lbl">Time</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{wpm}</div>
                <div className="stat-lbl">WPM</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{accuracy}%</div>
                <div className="stat-lbl">Acc</div>
              </div>
            </div>

            <p className="game-hint">
              Rank: most correct words, then lowest time. The current line stays in the focus band.
              Read speaks the challenge text while you type.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button onClick={handleBack} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">
          Home
        </button>
        <span className="app-header-title">Free play</span>
        <span style={{ width: '3rem' }} />
      </header>

      <div className="app-center">
        <div className="vsc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-vsc-accent)', marginBottom: '0.2rem' }}>
              Start race
            </h2>
            <p className="muted" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
              Race a random excerpt from the built-in source pool: random sentence start,
              2,000+ words, complete sentence end. Time limit: 4 minutes.
            </p>
          </div>

          {(error || (!kbReady && kbError)) && (
            <div className="alert-error">
              {error || kbError || 'Source pool is not available.'}
            </div>
          )}

          <button
            type="button"
            className="vsc-btn vsc-btn-lg"
            style={{ width: '100%', fontWeight: 600 }}
            disabled={creating || !kbReady}
            onClick={() => void startRandomRace()}
          >
            {creating
              ? 'Starting…'
              : kbReady
                ? 'Start random race'
                : 'Source pool unavailable'}
          </button>

          {kbReady && (
            <p className="muted" style={{ fontSize: '0.625rem', textAlign: 'center' }}>
              Pool size: {kbWordCount.toLocaleString()} words
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

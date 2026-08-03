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
  tournamentRank: number | null;
  tournamentError: string | null;
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
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [tournamentJoined, setTournamentJoined] = useState(false);
  const tournamentIdRef = useRef<string | null>(null);
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
    setComposing,
    getKeyIntervals,
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

  useEffect(() => {
    tournamentIdRef.current = tournamentId;
  }, [tournamentId]);

  /** Active typing only — idle must not lock scroll or show the teleprompter shell. */
  const isPlaying = phase === 'playing';
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
        body: JSON.stringify({
          challengeId,
          // Explicit id so tournament gates work even if postData is slow/missing.
          tournamentId: tournamentIdRef.current || undefined,
        }),
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
        const [meRes, postRes, kbRes, tournamentRes] = await Promise.all([
          fetch('/api/me'),
          fetch('/api/post/challenge'),
          fetch('/api/knowledge-base'),
          fetch('/api/post/tournament'),
        ]);
        if (meRes.ok) {
          const me = await meRes.json();
          if (!cancelled) {
            if (me.username) setUsername(me.username);
            if (me.subredditName) setSubredditName(me.subredditName);
            const pd = me.postData as { tournamentId?: string } | null;
            if (pd?.tournamentId) {
              setTournamentId(pd.tournamentId);
              tournamentIdRef.current = pd.tournamentId;
            }
          }
        }
        let postTournamentJoined = false;
        let postIsTournament = false;
        if (tournamentRes.ok) {
          const tData = await tournamentRes.json();
          if (!cancelled && tData.tournament) {
            postIsTournament = true;
            postTournamentJoined = Boolean(tData.joined);
            setTournamentId(tData.tournament.id as string);
            tournamentIdRef.current = tData.tournament.id as string;
            setTournamentName((tData.tournament.name as string) || null);
            setTournamentJoined(postTournamentJoined);
          }
        }
        if (postRes.ok) {
          const data = await postRes.json();
          // Tournament races require join first — do not auto-load the shared excerpt otherwise.
          if (!cancelled && data.challenge && (!postIsTournament || postTournamentJoined)) {
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
          tournamentId: tournamentIdRef.current || undefined,
          // Advisory only — server never trusts intervals for score; used for bot logging.
          keyIntervals: getKeyIntervals(),
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
        tournamentRank:
          typeof data.tournamentRank === 'number' ? data.tournamentRank : null,
        tournamentError:
          typeof data.tournamentError === 'string' ? data.tournamentError : null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submit failed';
      console.error('[Game] Submit score error:', err);
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
  }, [challenge, phase, getKeyIntervals]);

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
    // Code-point iteration — never split() UTF-16 (emoji / surrogate pairs break the cursor).
    const contentChars = Array.from(challenge.content);
    const inputChars = Array.from(input);
    const domainColor = DOMAIN_COLORS[challenge.domain as ContentDomain] ?? '#d4d4d4';

    return contentChars.map((char, idx) => {
      let className = 'ch-pending';
      let style: React.CSSProperties | undefined;
      let ref: React.RefObject<HTMLSpanElement | null> | undefined;

      if (idx < inputChars.length) {
        className = inputChars[idx] === char ? 'ch-correct' : 'ch-error';
      } else if (idx === inputChars.length) {
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
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center', gap: '0.65rem', display: 'flex', flexDirection: 'column' }}>
        <div className="spinner" />
        <p className="loading-text">{creating ? 'Creating…' : raceStarting ? 'Starting…' : 'Loading…'}</p>
      </div>
    );
  }

  // Race session failed before typing could begin.
  if (challenge && phase === 'idle' && (raceError || error) && !raceId) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <button onClick={handleBack} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">Home</button>
          <span className="app-header-title">Race error</span>
          <span style={{ width: '3rem' }} />
        </header>
        <div className="freeplay-shell">
          <div className="freeplay-hero">
            <div className="freeplay-hero-label">Could not start race</div>
            <div className="alert-error" style={{ marginTop: '0.5rem' }}>{raceError || error}</div>
          </div>
          <div className="freeplay-cta">
            <button type="button" className="vsc-btn vsc-btn-lg" style={{ width: '100%' }} onClick={handleRetryRaceStart}>Retry</button>
            <button type="button" className="vsc-btn vsc-btn-ghost vsc-btn-lg" style={{ width: '100%' }} onClick={handleTryAgain}>{fromPost ? 'Back' : 'New race'}</button>
          </div>
        </div>
      </div>
    );
  }

  // Results / uploading
  if (results || isEnded || submitting) {
    const isTimeout = phase === 'timeout';
    return (
      <div className="app-shell">
        <header className="app-header">
          <span className="app-header-title">{tournamentId ? 'Tournament' : 'Echokeys'}</span>
          {communityLabel && <span className="mono muted truncate" style={{ fontSize: '0.625rem' }}>{communityLabel}{tournamentName ? ` · ${tournamentName}` : ''}</span>}
          <span style={{ width: '3rem' }} />
        </header>

        <div className="results-shell">
          {/* Outcome headline */}
          <div className="results-hero">
            <h1 className={`results-outcome ${isTimeout ? 'timeout' : 'complete'}`}>
              {isTimeout ? "Time's up" : 'Complete'}
            </h1>
            {communityLabel && (
              <p className="results-community">
                {communityLabel}
                {tournamentName ? ` · ${tournamentName}` : ''}
              </p>
            )}
          </div>

          {submitting && !results ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.65rem' }}>
              <div className="spinner" />
              <p className="muted" style={{ fontSize: '0.75rem' }}>Saving results…</p>
            </div>
          ) : results ? (
            <>
              {/* Big numbers */}
              <div className="results-grid">
                <div className="results-cell">
                  <div className="results-cell-val primary">{results.correctWords.toLocaleString()}</div>
                  <div className="results-cell-lbl">Correct words</div>
                </div>
                <div className="results-cell">
                  <div className="results-cell-val neutral">{results.timeSeconds}s</div>
                  <div className="results-cell-lbl">Time</div>
                </div>
                <div className="results-cell">
                  <div className="results-cell-val good">{results.wpm}</div>
                  <div className="results-cell-lbl">WPM</div>
                </div>
                <div className="results-cell">
                  <div className={`results-cell-val ${results.accuracy >= 90 ? 'good' : results.accuracy >= 70 ? 'warn' : 'neutral'}`}>{results.accuracy}%</div>
                  <div className="results-cell-lbl">Accuracy</div>
                </div>
              </div>

              {/* Rank strip */}
              <div className="results-ranks">
                {tournamentId && (
                  <div className="results-rank-item">
                    <div className="results-rank-val">{results.tournamentRank ? `#${results.tournamentRank}` : '—'}</div>
                    <div className="results-rank-lbl">Tournament</div>
                  </div>
                )}
                <div className="results-rank-item">
                  <div className="results-rank-val">{results.weeklyRank ? `#${results.weeklyRank}` : '—'}</div>
                  <div className="results-rank-lbl">Weekly</div>
                </div>
                <div className="results-rank-item">
                  <div className="results-rank-val">{results.allTimeRank ? `#${results.allTimeRank}` : '—'}</div>
                  <div className="results-rank-lbl">All-time</div>
                </div>
                <div className="results-rank-item">
                  <div className="results-rank-val" style={{ color: 'var(--color-muted)' }}>{results.wordsTyped.toLocaleString()}</div>
                  <div className="results-rank-lbl">Total typed</div>
                </div>
              </div>

              {/* Eligibility / tournament notes */}
              {(results.tournamentError || !results.ranked) && (
                <div style={{ padding: '0.65rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
                  {results.tournamentError && (
                    <p className="mono" style={{ fontSize: '0.625rem', color: 'var(--color-orange)' }}>Tournament: {results.tournamentError}</p>
                  )}
                  {!results.ranked && (
                    <p className="mono muted" style={{ fontSize: '0.625rem' }}>
                      Run saved — needs 20+ correct words or 50%+ progress to rank.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <div className="mono muted" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
                {correctWords} correct · {elapsed > 0 ? `${elapsed}s` : '0s'} · {wpm} WPM · {accuracy}%
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '0.65rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
              <div className="alert-error">
                {error}
                <button type="button" className="vsc-btn vsc-btn-sm" style={{ marginTop: '0.4rem' }} onClick={() => { submittedKeys.clear(); void submitResults(); }}>Retry upload</button>
              </div>
            </div>
          )}

          {/* Actions pinned to bottom */}
          <div className="results-actions">
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-lg" style={{ width: '100%' }}>
              {fromPost ? 'Race again' : 'New race'}
            </button>
            <button onClick={() => { window.location.href = 'leaderboard.html'; }} className="vsc-btn vsc-btn-ghost vsc-btn-lg" style={{ width: '100%' }}>
              {tournamentId ? 'Tournament standings' : 'Leaderboard'}
            </button>
            <button onClick={handleBack} className="vsc-btn vsc-btn-ghost vsc-btn-sm" style={{ width: '100%' }}>Home</button>
          </div>
        </div>
      </div>
    );
  }

  // Tournament post — user hasn't joined yet
  if (tournamentId && !tournamentJoined && !challenge) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <button onClick={handleBack} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">Back</button>
          <span className="app-header-title">Join to race</span>
          <span style={{ width: '3rem' }} />
        </header>
        <div className="freeplay-shell">
          <div className="freeplay-hero">
            <div className="freeplay-hero-label">Tournament</div>
            <div className="freeplay-hero-title">{tournamentName || 'This tournament'}</div>
            <div className="freeplay-hero-desc">Join the tournament from the post page before you can race the shared excerpt.</div>
          </div>
          <div className="freeplay-cta">
            <button type="button" className="vsc-btn vsc-btn-lg" style={{ width: '100%' }} onClick={handleBack}>Back to join</button>
          </div>
        </div>
      </div>
    );
  }

  if (challenge && isPlaying) {
    const readLabel = muted ? 'Read' : speaking ? 'Reading…' : 'Read';
    const muteLabel = muted ? '🔇 Unmute' : '🔊 Mute';
    const onMuteClick = () => {
      toggleMute();
      focusCapture();
    };

    return (
      <div className="app-shell app-shell-game" ref={shellRef}>
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
            <span className="app-header-title">{tournamentId ? 'Tournament' : 'Echokeys'}</span>
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
              onClick={onMuteClick}
              className={`vsc-btn vsc-btn-sm mute-btn ${muted ? 'mute-btn-off' : 'mute-btn-on'}`}
              type="button"
              aria-label={muted ? 'Unmute narration' : 'Mute narration'}
              title={muted ? 'Unmute audio' : 'Mute audio'}
              aria-pressed={!muted}
            >
              {muteLabel}
            </button>
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">
              Reset
            </button>
          </div>
        </header>

        <div
          className={`audio-control-bar ${speaking && !muted ? 'audio-control-bar-active' : ''}`}
          role="region"
          aria-label="Audio controls"
        >
          <span className="mono" style={{ fontSize: '0.6875rem', flex: 1, minWidth: 0 }}>
            {muted ? 'Audio muted' : speaking ? 'Reading aloud' : 'Tap Read or Unmute to hear'}
          </span>
          <button
            type="button"
            className={`vsc-btn vsc-btn-sm mute-btn ${muted ? 'mute-btn-off' : 'mute-btn-on'}`}
            onClick={onMuteClick}
            aria-label={muted ? 'Unmute narration' : 'Mute narration'}
            title={muted ? 'Unmute audio' : 'Mute audio'}
            aria-pressed={!muted}
          >
            {muteLabel}
          </button>
        </div>

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
                  onCompositionStart={() => setComposing(true)}
                  onCompositionEnd={(e) => {
                    setComposing(false);
                    // Commit composed cluster through the same validation path.
                    type(e.currentTarget.value);
                    requestAnimationFrame(lockCursorInView);
                  }}
                  onPaste={(e) => {
                    // Paste is never a valid typing path.
                    e.preventDefault();
                  }}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
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

            <div className="game-stats-row" aria-live="polite" aria-atomic="true">
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
              Rank: most correct words, then lowest time. Use <strong>Mute</strong> anytime to stop
              narration instantly.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button onClick={handleBack} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">Home</button>
        <span className="app-header-title">Free play</span>
        <span style={{ width: '3rem' }} />
      </header>

      <div className="freeplay-shell">
        <div className="freeplay-hero">
          <div className="freeplay-hero-label">Race</div>
          <div className="freeplay-hero-title">echo<em style={{ fontStyle: 'normal', color: 'var(--color-accent)' }}>keys</em></div>
          <div className="freeplay-hero-desc">
            A random 2,000+ word excerpt. Race starts immediately. 4-minute time limit.
            Rank by correct words, then lowest time.
          </div>
          {kbReady && (
            <div className="freeplay-hero-pool">Pool: {kbWordCount.toLocaleString()} words</div>
          )}
        </div>

        {(error || (!kbReady && kbError)) && (
          <div className="freeplay-error">
            <div className="alert-error">{error || kbError || 'Source pool unavailable.'}</div>
          </div>
        )}

        <div className="freeplay-cta">
          <button
            type="button"
            className="vsc-btn vsc-btn-lg"
            style={{ width: '100%' }}
            disabled={creating || !kbReady}
            onClick={() => void startRandomRace()}
          >
            {creating ? 'Starting…' : kbReady ? 'Start random race' : 'Source pool unavailable'}
          </button>
        </div>
      </div>
    </div>
  );
};

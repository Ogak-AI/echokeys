import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTypingGame } from '../hooks/useTypingGame';
import type { Challenge, ContentDomain } from '../../shared/types/index';
import { DOMAIN_COLORS } from '../../shared/types/index';
import { calculateWpm } from '../../shared/utils/antiCheat';
import { context } from '../shims/devvit-web-client';

type Results = {
  score: number;
  wpm: number;
  accuracy: number;
  weeklyRank: number | null;
  allTimeRank: number | null;
  wordsTyped: number;
};

/** Guard against React StrictMode double-submits in development. */
const submittedKeys = new Set<string>();

export const App = () => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [fromPost, setFromPost] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState(context?.username ?? 'Player');
  const [subredditName, setSubredditName] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoStartedId = useRef<string | null>(null);

  const {
    phase,
    input,
    wpm,
    accuracy,
    remaining,
    progress,
    score,
    elapsed,
    muted,
    throttled,
    start,
    type,
    toggleMute,
    reset,
  } = useTypingGame(challenge);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [meRes, postRes] = await Promise.all([
          fetch('/api/me'),
          fetch('/api/post/challenge'),
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
      autoStartedId.current = challenge.id;
      start();
    }
  }, [challenge, phase, start]);

  useEffect(() => {
    if (phase === 'playing' && !throttled) {
      textareaRef.current?.focus();
    }
  }, [phase, throttled, challenge?.id]);

  const submitResults = useCallback(async () => {
    if (!challenge || phase === 'idle' || phase === 'playing') return;

    const timeSeconds = Math.max(1, elapsed || 1);
    const submitWpm =
      phase === 'finished' ? calculateWpm(challenge.content.length, timeSeconds) : wpm;

    const key = `${challenge.id}:${phase}:${timeSeconds}:${submitWpm}`;
    if (submittedKeys.has(key)) return;
    submittedKeys.add(key);

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/score/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.id,
          wpm: submitWpm,
          accuracy,
          timeSeconds,
          completed: phase === 'finished',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit score');
      setResults({
        score: data.score.score,
        wpm: data.score.wpm,
        accuracy: data.score.accuracy,
        weeklyRank: data.weeklyRank,
        allTimeRank: data.allTimeRank,
        wordsTyped: data.score.wordsTyped ?? 0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submit failed';
      console.error('Submit score error:', err);
      setError(message);
      submittedKeys.delete(key);
    } finally {
      setSubmitting(false);
    }
  }, [challenge, wpm, accuracy, elapsed, phase]);

  useEffect(() => {
    if (phase === 'finished' || phase === 'timeout') {
      void submitResults();
    }
  }, [phase, submitResults]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/challenge/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate challenge');
      setFromPost(false);
      autoStartedId.current = null;
      setChallenge(data.challenge);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during generation');
    } finally {
      setGenerating(false);
    }
  };

  const handleBack = () => {
    window.location.href = 'splash.html';
  };

  const handleTryAgain = () => {
    setResults(null);
    setError(null);
    if (fromPost && challenge) {
      autoStartedId.current = null;
      reset();
      return;
    }
    autoStartedId.current = null;
    setChallenge(null);
    reset();
  };

  const renderCodeChars = () => {
    if (!challenge) return null;
    const content = challenge.content;
    const domainColor = DOMAIN_COLORS[challenge.domain as ContentDomain] ?? '#d4d4d4';

    return content.split('').map((char, idx) => {
      let className = 'ch-pending';
      let style: React.CSSProperties | undefined;

      if (idx < input.length) {
        className = input[idx] === char ? 'ch-correct' : 'ch-error';
      } else if (idx === input.length) {
        className = 'ch-cursor';
      } else if (challenge.domain === 'code') {
        style = { color: domainColor, opacity: 0.55 };
      }

      return (
        <span key={idx} className={className} style={style}>
          {char === '\n' ? '↵\n' : char}
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

  if (loading || generating) {
    return (
      <div className="app-shell app-center" style={{ gap: '0.65rem' }}>
        <div className="spinner" />
        <p className="loading-text">
          {generating ? 'Generating…' : 'Loading…'}
        </p>
      </div>
    );
  }

  if (results || (submitting && (phase === 'finished' || phase === 'timeout'))) {
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
                  <div className="stat-val stat-val-green">{results.score}</div>
                  <div className="stat-lbl">Score</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val">{results.wpm}</div>
                  <div className="stat-lbl">WPM</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val">{results.accuracy}%</div>
                  <div className="stat-lbl">Accuracy</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val stat-val-accent">
                    {results.weeklyRank ? `#${results.weeklyRank}` : '—'}
                  </div>
                  <div className="stat-lbl">Weekly</div>
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
                <span>{results.wordsTyped.toLocaleString()} words</span>
                <span>All-time {results.allTimeRank ? `#${results.allTimeRank}` : '—'}</span>
              </div>
            </>
          ) : null}

          {error && (
            <div className="alert-error">
              {error}
              <button
                type="button"
                className="vsc-btn vsc-btn-sm"
                style={{ display: 'block', marginTop: '0.4rem' }}
                onClick={() => {
                  if (challenge) {
                    const timeSeconds = Math.max(1, elapsed || 1);
                    const submitWpm =
                      phase === 'finished'
                        ? calculateWpm(challenge.content.length, timeSeconds)
                        : wpm;
                    submittedKeys.delete(
                      `${challenge.id}:${phase}:${timeSeconds}:${submitWpm}`
                    );
                  }
                  void submitResults();
                }}
              >
                Retry upload
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-lg" style={{ width: '100%' }}>
              {fromPost ? 'Retry' : 'New Challenge'}
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

  if (challenge && (phase === 'playing' || phase === 'idle')) {
    return (
      <div className="app-shell">
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
            <button onClick={toggleMute} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">
              {muted ? '🔇' : '🔊'}
            </button>
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">
              Reset
            </button>
          </div>
        </header>

        <div className="game-layout">
          <div className="game-editor-col">
            <div className="editor-panel" style={{ flex: 1 }}>
              <div className="editor-titlebar">
                <span className="truncate">
                  challenge.txt — {username}
                  {challenge.prompt
                    ? ` · ${challenge.prompt.slice(0, 40)}${challenge.prompt.length > 40 ? '…' : ''}`
                    : ''}
                </span>
              </div>
              <div className="editor-content" style={{ background: 'var(--color-vsc-bg-darker)' }}>
                {renderCodeChars()}
              </div>
            </div>

            <div>
              {throttled && (
                <div className="alert-warn" style={{ marginBottom: '0.35rem' }}>
                  Locked 1.5s — max 7 words/sec
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => type(e.target.value)}
                placeholder={throttled ? 'Locked…' : 'Type the content above…'}
                disabled={throttled}
                className="typing-input"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>
          </div>

          <aside className="game-aside">
            <div className="game-timer-row">
              <div>
                <div className="stat-lbl" style={{ marginTop: 0 }}>
                  Time
                </div>
                <div
                  className={`timer-display ${
                    remaining < 60 ? 'timer-danger' : remaining < 180 ? 'timer-warn' : ''
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
                <div className="stat-val">{wpm}</div>
                <div className="stat-lbl">WPM</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{accuracy}%</div>
                <div className="stat-lbl">Acc</div>
              </div>
              <div className="stat-box">
                <div className="stat-val stat-val-accent">{score}</div>
                <div className="stat-lbl">Score</div>
              </div>
            </div>

            <p className="game-hint">
              Green = correct · Red = error · Final score only is uploaded
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
          ← Home
        </button>
        <span className="app-header-title">New challenge</span>
        <span style={{ width: '3rem' }} />
      </header>

      <div className="app-center">
        <div className="vsc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-vsc-accent)', marginBottom: '0.2rem' }}>
              Start typing race
            </h2>
            <p className="muted" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
              Enter a prompt. AI generates the text — you type it. Or use the subreddit menu for community races.
            </p>
          </div>

          <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {error && <div className="alert-error">{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label className="muted" style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "recursive function", "legal brief", "marketing copy"'
                className="vsc-input"
                style={{ height: '4.5rem', resize: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                required
                minLength={3}
              />
            </div>

            <button type="submit" className="vsc-btn vsc-btn-lg" style={{ width: '100%', fontWeight: 600 }}>
              Generate &amp; Start
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

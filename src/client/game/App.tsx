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

  // Load post-attached challenge first (primary product path)
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

  // Auto-start once per challenge id
  useEffect(() => {
    if (challenge && phase === 'idle' && autoStartedId.current !== challenge.id) {
      autoStartedId.current = challenge.id;
      start();
    }
  }, [challenge, phase, start]);

  // Keep focus on the typing area while playing
  useEffect(() => {
    if (phase === 'playing' && !throttled) {
      textareaRef.current?.focus();
    }
  }, [phase, throttled, challenge?.id]);

  const submitResults = useCallback(async () => {
    if (!challenge || phase === 'idle' || phase === 'playing') return;

    const timeSeconds = Math.max(1, elapsed || 1);
    // Align WPM with server recalculation (content length / time)
    const submitWpm =
      phase === 'finished'
        ? calculateWpm(challenge.content.length, timeSeconds)
        : wpm;

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#1e1e1e] text-[#d4d4d4]">
        <div className="spinner" />
        <p className="loading-text">
          {generating ? 'Generating challenge content…' : 'Loading challenge…'}
        </p>
      </div>
    );
  }

  if (results || (submitting && (phase === 'finished' || phase === 'timeout'))) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#1e1e1e] text-[#d4d4d4]">
        <div className="w-full max-w-md rounded p-6 bg-[#252526] border border-[#3c3c3c] flex flex-col gap-5">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#4ec9b0]">
              {phase === 'timeout' ? "Time's Up" : 'Challenge Complete'}
            </h2>
            {communityLabel && (
              <p className="text-xs text-[#858585] mt-1 font-mono">{communityLabel}</p>
            )}
          </div>

          {submitting && !results ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="spinner" />
              <p className="text-xs text-[#858585]">Uploading score…</p>
            </div>
          ) : results ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="stat-box">
                  <div className="stat-val stat-val-green">{results.score}</div>
                  <div className="stat-lbl">Final Score</div>
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
                  <div className="stat-lbl">Weekly Rank</div>
                </div>
              </div>
              <div className="flex justify-between text-xs font-mono text-[#858585] px-1">
                <span>{results.wordsTyped.toLocaleString()} words this session</span>
                <span>
                  All-time {results.allTimeRank ? `#${results.allTimeRank}` : '—'}
                </span>
              </div>
            </>
          ) : null}

          {error && (
            <div className="p-3 text-xs rounded bg-red-900/30 text-red-400 border border-red-800">
              {error}
              <button
                type="button"
                className="block mt-2 text-[#9cdcfe] underline"
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

          <div className="flex flex-col gap-2 mt-1">
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-lg justify-center w-full">
              {fromPost ? 'Retry Challenge' : 'New Challenge'}
            </button>
            <button
              onClick={() => {
                window.location.href = 'leaderboard.html';
              }}
              className="vsc-btn-ghost vsc-btn vsc-btn-lg justify-center w-full"
            >
              Community Leaderboard
            </button>
            <button
              onClick={handleBack}
              className="vsc-btn-ghost vsc-btn justify-center w-full text-xs"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (challenge && (phase === 'playing' || phase === 'idle')) {
    return (
      <div className="min-h-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4]">
        <header className="flex justify-between items-center px-4 py-2.5 bg-[#252526] border-b border-[#3c3c3c]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[#007acc] font-bold shrink-0">Echokeys</span>
            <span
              className="text-[10px] px-2 py-0.5 rounded font-mono border border-[#3c3c3c] shrink-0"
              style={{ color: DOMAIN_COLORS[challenge.domain] }}
            >
              {challenge.domain}
            </span>
            {communityLabel && (
              <span className="text-[10px] text-[#858585] font-mono truncate">{communityLabel}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleMute} className="vsc-btn vsc-btn-ghost text-xs py-1 px-2">
              {muted ? 'Speech off' : 'Speech on'}
            </button>
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-ghost text-xs py-1 px-2">
              Reset
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col md:flex-row min-h-0">
          <div className="flex-1 flex flex-col p-3 md:p-4 min-w-0">
            <div className="editor-panel flex-1 flex flex-col min-h-0">
              <div className="editor-titlebar">
                <span className="truncate">
                  challenge.txt — {username}
                  {challenge.prompt
                    ? ` · ${challenge.prompt.slice(0, 56)}${challenge.prompt.length > 56 ? '…' : ''}`
                    : ''}
                </span>
              </div>
              <div className="editor-content flex-1 bg-[#181818]">{renderCodeChars()}</div>
            </div>

            <div className="mt-3">
              {throttled && (
                <div className="mb-2 p-2 text-xs rounded bg-red-950/40 text-[#f48771] border border-red-900/60 font-semibold text-center font-mono">
                  Input locked 1.5s — speed limit is 7 words/sec
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => type(e.target.value)}
                placeholder={
                  throttled ? 'Locked…' : 'Type the AI-generated content above…'
                }
                disabled={throttled}
                className={`w-full h-24 p-3 bg-[#181818] border rounded font-mono focus:outline-none resize-none transition-all duration-150 ${
                  throttled
                    ? 'border-[#f48771] text-[#f48771] opacity-50 cursor-not-allowed'
                    : 'border-[#3c3c3c] text-[#d4d4d4] focus:border-[#007acc]'
                }`}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>
          </div>

          <aside className="w-full md:w-56 bg-[#252526] border-t md:border-t-0 md:border-l border-[#3c3c3c] p-4 flex flex-col gap-3">
            <div className="text-center">
              <span className="text-xs text-[#858585] uppercase tracking-wider">Remaining</span>
              <div
                className={`timer-display mt-1 ${
                  remaining < 60 ? 'timer-danger' : remaining < 180 ? 'timer-warn' : ''
                }`}
              >
                {formatTime(remaining)}
              </div>
            </div>

            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-center text-[10px] text-[#858585] font-mono">{progress}%</p>

            <div className="grid grid-cols-3 md:grid-cols-1 gap-2">
              <div className="stat-box">
                <div className="stat-val text-xl md:text-[1.75rem]">{wpm}</div>
                <div className="stat-lbl">WPM</div>
              </div>
              <div className="stat-box">
                <div className="stat-val text-xl md:text-[1.75rem]">{accuracy}%</div>
                <div className="stat-lbl">Accuracy</div>
              </div>
              <div className="stat-box">
                <div className="stat-val stat-val-accent text-xl md:text-[1.75rem]">{score}</div>
                <div className="stat-lbl">Score</div>
              </div>
            </div>

            <p className="text-[10px] text-[#858585] leading-relaxed mt-auto hidden md:block">
              Score = (Accuracy% × 100) + WPM − (time/60). Green = correct, red = mistake. Only
              your final score is uploaded.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  // Free-play: generate a challenge when no post is attached
  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4]">
      <div className="p-4">
        <button onClick={handleBack} className="vsc-btn vsc-btn-ghost text-xs">
          ← Back
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg rounded p-6 bg-[#252526] border border-[#3c3c3c]">
          <h2 className="text-xl font-bold mb-2 text-[#007acc]">Start a Typing Challenge</h2>
          <p className="text-xs text-[#858585] mb-4 leading-relaxed">
            Submit a prompt. The AI generates the content — you type it. Or create a community
            challenge from the subreddit menu so others race the same text.
          </p>

          <form onSubmit={handleGenerate} className="flex flex-col gap-4">
            {error && (
              <div className="p-3 text-xs rounded bg-red-900/30 text-red-400 border border-red-800">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#858585]">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "Build a recursive function", "Write a legal brief opening", "Draft marketing copy…"'
                className="vsc-input h-24 resize-none"
                required
                minLength={3}
              />
            </div>

            <button
              type="submit"
              className="vsc-btn vsc-btn-lg justify-center w-full mt-1 font-semibold"
            >
              Generate &amp; Start Race
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

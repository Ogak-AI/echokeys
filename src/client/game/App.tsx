import React, { useState, useEffect } from 'react';
import { useTypingGame } from '../hooks/useTypingGame';
import type { Challenge } from '../../shared/types/index';
import { context } from '../shims/devvit-web-client';

export const App = () => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ score: number; wpm: number; accuracy: number; rank: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const username = context?.username ?? 'Player';

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/challenge/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate challenge');
      setChallenge(data.challenge);
    } catch (err: any) {
      setError(err.message || 'An error occurred during generation');
    } finally {
      setLoading(false);
    }
  };

  // Start game when challenge is generated/loaded
  useEffect(() => {
    if (challenge) {
      start();
    }
  }, [challenge, start]);

  // Handle game completion
  useEffect(() => {
    if (phase === 'finished' || phase === 'timeout') {
      submitResults();
    }
  }, [phase]);

  const submitResults = async () => {
    if (!challenge) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/score/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          challengeId: challenge.id,
          wpm,
          accuracy,
          timeSeconds: elapsed || 0,
          completed: phase === 'finished',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit score');
      setResults({
        score: data.score.score,
        wpm: data.score.wpm,
        accuracy: data.score.accuracy,
        rank: data.weeklyRank,
      });
    } catch (err: any) {
      console.error('Submit score error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    window.location.href = 'splash.html';
  };

  const handleTryAgain = () => {
    setChallenge(null);
    setResults(null);
    reset();
  };

  // Render character by character in the typing interface
  const renderCodeChars = () => {
    if (!challenge) return null;
    const content = challenge.content;
    return content.split('').map((char, idx) => {
      let className = 'ch-pending';
      if (idx < input.length) {
        className = input[idx] === char ? 'ch-correct' : 'ch-error';
      } else if (idx === input.length) {
        className = 'ch-cursor';
      }
      return (
        <span key={idx} className={className}>
          {char === '\n' ? '↵\n' : char}
        </span>
      );
    });
  };

  // Formatter for timer
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#1e1e1e] text-[#d4d4d4]">
        <div className="spinner"></div>
        <p className="loading-text text-sm">Building your challenge using Claude API...</p>
      </div>
    );
  }

  if (results) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#1e1e1e] text-[#d4d4d4]">
        <div className="w-full max-w-md rounded p-6 bg-[#252526] border border-[#3c3c3c] flex flex-col gap-6">
          <h2 className="text-2xl font-bold text-center text-[#4ec9b0] mb-2">Challenge Completed!</h2>

          <div className="grid grid-cols-2 gap-4">
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
              <div className="stat-val stat-val-accent">{results.rank ? `#${results.rank}` : 'N/A'}</div>
              <div className="stat-lbl">Weekly Rank</div>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-lg justify-center w-full">
              New Challenge
            </button>
            <button onClick={handleBack} className="vsc-btn-ghost vsc-btn vsc-btn-lg justify-center w-full">
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
        {/* Top Header Bar */}
        <div className="flex justify-between items-center px-6 py-3 bg-[#252526] border-b border-[#3c3c3c]">
          <div className="flex items-center gap-3">
            <span className="text-[#007acc] font-bold">Echokeys Editor</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={toggleMute} className="vsc-btn vsc-btn-ghost text-xs py-1">
              {muted ? '🔈 Unmute' : '🔊 Mute Sound'}
            </button>
            <button onClick={handleTryAgain} className="vsc-btn vsc-btn-ghost text-xs py-1">
              Reset
            </button>
          </div>
        </div>

        {/* Editor Layout */}
        <div className="flex flex-1 flex-col md:flex-row">
          {/* Main Code Area */}
          <div className="flex-1 flex flex-col p-4">
            <div className="editor-panel flex-1 flex flex-col">
              <div className="editor-titlebar">
                <span>typing_challenge.txt — {username}</span>
              </div>
              <div className="editor-content flex-1 bg-[#181818] p-4 font-mono overflow-y-auto outline-none" style={{ minHeight: '300px' }}>
                {renderCodeChars()}
              </div>
            </div>

            {/* Typing box */}
            <div className="mt-4">
              {throttled && (
                <div className="mb-2 p-2 text-xs rounded bg-red-950/40 text-[#f48771] border border-red-900/60 font-semibold animate-pulse text-center font-mono">
                  Input Throttled: Speed limit (7 WPS) exceeded or paste detected. Pausing briefly...
                </div>
              )}
              <textarea
                value={input}
                onChange={(e) => type(e.target.value)}
                placeholder={throttled ? "Throttled..." : "Start typing the content above..."}
                disabled={throttled}
                className={`w-full h-24 p-3 bg-[#181818] border rounded font-mono focus:outline-none resize-none transition-all duration-150 ${
                  throttled 
                    ? 'border-[#f48771] text-[#f48771] opacity-50 cursor-not-allowed' 
                    : 'border-[#3c3c3c] text-[#d4d4d4] focus:border-[#007acc]'
                }`}
                autoFocus
              />
            </div>
          </div>

          {/* Sidebar (Stats) */}
          <div className="w-full md:w-64 bg-[#252526] border-t md:border-t-0 md:border-l border-[#3c3c3c] p-4 flex flex-col gap-4">
            <div className="text-center">
              <span className="text-xs text-[#858585] uppercase tracking-wider">Remaining Time</span>
              <div className={`timer-display mt-1 ${remaining < 60 ? 'timer-danger' : remaining < 180 ? 'timer-warn' : ''}`}>
                {formatTime(remaining)}
              </div>
            </div>

            <div className="progress-bar my-2">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
              <div className="stat-box">
                <div className="stat-val">{wpm}</div>
                <div className="stat-lbl">WPM</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{accuracy}%</div>
                <div className="stat-lbl">Accuracy</div>
              </div>
              <div className="stat-box col-span-2 md:col-span-1">
                <div className="stat-val stat-val-accent">{score}</div>
                <div className="stat-lbl">Estimated Score</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4]">
      {/* Back button */}
      <div className="p-4">
        <button onClick={handleBack} className="vsc-btn vsc-btn-ghost text-xs">
          ← Back
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg rounded p-6 bg-[#252526] border border-[#3c3c3c]">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#007acc' }}>Create Typing Challenge</h2>

          <form onSubmit={handleGenerate} className="flex flex-col gap-4">
            {error && (
              <div className="p-3 text-xs rounded bg-red-900/30 text-red-400 border border-red-800">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#858585]">What content would you like to type?</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Write binary search in Rust, Draft marketing copy for a new productivity app, Generate a legal contract template..."
                className="vsc-input h-24 resize-none"
                required
              />
            </div>



            <button type="submit" className="vsc-btn vsc-btn-lg justify-center w-full mt-4 font-semibold">
              Generate & Start Race
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

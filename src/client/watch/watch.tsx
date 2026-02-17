import '../index.css';

import { requestExpandedMode, context } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

type GameState = {
  sessionId: string;
  username: string;
  verseText: string;
  currentText: string;
  wpm: number;
  accuracy: number;
  elapsedTime: number;
  spectatorCount: number;
  isFinished?: boolean;
  finalWpm?: number;
  finalAccuracy?: number;
};

export const SpectatorView = () => {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const sessionId = new URLSearchParams(window.location.search).get('sessionId');

  useEffect(() => {
    if (!sessionId) {
      setError('Missing sessionId');
      setLoading(false);
      return;
    }

    const subscribeToGame = async () => {
      try {
        // Fetch initial session state via REST
        const resp = await fetch(`/api/session/${sessionId}`);
        if (!resp.ok) {
          console.error('[Watch] Session fetch failed:', resp.status);
          setError('Session not found or unavailable');
          setLoading(false);
          return;
        }
        const session = await resp.json();
        setGame(session);
        setConnectionStatus('connected');
        setLoading(false);

        // Check if context.realtime exists before subscribing
        if (!context?.realtime) {
          console.warn('[Watch] Devvit realtime not available, using polling fallback');
          // Fallback: poll for updates every 1 second
          const pollInterval = setInterval(async () => {
            try {
              const updateResp = await fetch(`/api/session/${sessionId}`);
              if (updateResp.ok) {
                const updated = await updateResp.json();
                setGame(updated);
              }
            } catch (pollErr) {
              console.error('[Watch] Polling error:', pollErr);
            }
          }, 1000);
          return () => clearInterval(pollInterval);
        }

        // Subscribe to realtime updates
        try {
          const unsubscribe = context.realtime.subscribe(`session:${sessionId}`, (event: any) => {
            try {
              const msg = typeof event === 'string' ? JSON.parse(event) : event;
              console.log('[Watch] Received message:', msg.type);

              if (msg.type === 'PLAYER_PROGRESS') {
                setGame((prev) =>
                  prev
                    ? {
                        ...prev,
                        currentText: msg.currentText,
                        wpm: msg.wpm,
                        accuracy: msg.accuracy,
                        elapsedTime: msg.elapsedTime,
                      }
                    : null
                );
              } else if (msg.type === 'GAME_ENDED') {
                setGame((prev) =>
                  prev
                    ? {
                        ...prev,
                        isFinished: true,
                        finalWpm: msg.finalWpm,
                        finalAccuracy: msg.finalAccuracy,
                      }
                    : null
                );
              }
            } catch (parseErr) {
              console.error('[Watch] Failed to parse realtime event:', parseErr);
            }
          });

          // Increment spectator count
          try {
            const joinResp = await fetch(`/api/spectator/join`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            });
            if (!joinResp.ok) {
              console.error('[Watch] Failed to join as spectator:', joinResp.status);
            }
          } catch (joinErr) {
            console.error('[Watch] Join error:', joinErr);
          }

          return () => {
            try {
              unsubscribe();
            } catch (unsubErr) {
              console.error('[Watch] Failed to unsubscribe:', unsubErr);
            }
            // Decrement spectator count
            fetch(`/api/spectator/leave`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            }).catch((err) => console.error('[Watch] Leave error:', err));
          };
        } catch (subscribeErr) {
          console.error('[Watch] Failed to subscribe to session:', subscribeErr);
        }
      } catch (err) {
        console.error('[Watch] Setup error:', err);
        setError('Failed to load game');
        setLoading(false);
      }
    };

    subscribeToGame();
  }, [sessionId]);

  const handleLeave = () => {
    try {
      void requestExpandedMode(new MouseEvent('click'), 'games.html');
    } catch {
      window.location.href = 'games.html';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
        <div className="text-center">
          <div className="text-xl mb-4">Loading game...</div>
          <div className="text-sm text-gray-400">{connectionStatus}</div>
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
        <div className="text-center">
          <div className="text-xl text-red-400 mb-4">{error || 'Game not found'}</div>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const progress = game.verseText.length > 0 ? (game.currentText.length / game.verseText.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">{game.username}</h1>
            <p className="text-sm text-gray-400 mt-2">
              Spectators: {game.spectatorCount} • Status: {connectionStatus}
            </p>
          </div>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
          >
            Leave
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">WPM</p>
            <p className="text-2xl font-bold text-blue-400">{game.wpm.toFixed(1)}</p>
          </div>
          <div className="bg-gray-800 rounded p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Accuracy</p>
            <p className="text-2xl font-bold text-green-400">
              {(game.accuracy * 100).toFixed(1)}%
            </p>
          </div>
          <div className="bg-gray-800 rounded p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Time</p>
            <p className="text-2xl font-bold text-yellow-400">{game.elapsedTime.toFixed(1)}s</p>
          </div>
        </div>

        {/* Verse Text */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <h3 className="text-lg font-semibold mb-4">Challenge Text</h3>
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Verse Display with Text Windowing */}
            <div className="relative bg-gray-900 rounded p-4 font-mono text-sm leading-relaxed h-24 overflow-hidden">
              <pre className="whitespace-pre-wrap break-words">
                {game.verseText.split(/(.{110})/).map((chunk, idx) => {
                  const start = idx * 110;
                  const typed = game.currentText.substring(start, start + 110);
                  const remaining = chunk.substring(typed.length);

                  return (
                    <span key={idx}>
                      <span className="text-green-400">{typed}</span>
                      <span className="text-gray-400">{remaining}</span>
                    </span>
                  );
                })}
              </pre>
            </div>

            {/* Typed Text */}
            <div className="bg-gray-900 rounded p-4">
              <p className="text-xs text-gray-500 mb-2">Typed</p>
              <p className="font-mono text-white break-words">{game.currentText || '(typing...)'}</p>
            </div>
          </div>
        </div>

        {/* Game Over Screen */}
        {game.isFinished && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
            <h2 className="text-2xl font-bold mb-4">Game Finished!</h2>
            <div className="space-y-2 mb-6">
              <p className="text-lg">
                Final WPM: <span className="text-blue-400 font-bold">{game.finalWpm?.toFixed(1)}</span>
              </p>
              <p className="text-lg">
                Final Accuracy:{' '}
                <span className="text-green-400 font-bold">
                  {(game.finalAccuracy ? game.finalAccuracy * 100 : 0).toFixed(1)}%
                </span>
              </p>
            </div>
            <button
              onClick={handleLeave}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold"
            >
              Back to Lobby
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpectatorView />
  </StrictMode>
);

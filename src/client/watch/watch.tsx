import '../index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState, useRef } from 'react';
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
  const wsRef = useRef<WebSocket | null>(null);

  const sessionId = new URLSearchParams(window.location.search).get('sessionId');

  useEffect(() => {
    if (!sessionId) {
      setError('Missing sessionId');
      setLoading(false);
      return;
    }

    const connectWebSocket = () => {
      try {
        // Construct WS URL from current location
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/spectator?sessionId=${sessionId}`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          setConnectionStatus('connected');
          ws.send(JSON.stringify({ type: 'JOIN', sessionId }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            console.log('Received message:', msg.type);

            if (msg.type === 'JOINED') {
              setGame(msg.session);
              setLoading(false);
            } else if (msg.type === 'PLAYER_PROGRESS') {
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
            } else if (msg.type === 'ERROR') {
              setError(msg.message);
              setLoading(false);
            }
          } catch (err) {
            console.error('Failed to parse message', err);
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error', event);
          setConnectionStatus('error');
          setError('WebSocket connection error');
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
          setConnectionStatus('disconnected');
          setError('Connection closed');
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('Failed to create WebSocket', err);
        setError('Failed to connect');
        setLoading(false);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionId]);

  const handleLeave = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
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

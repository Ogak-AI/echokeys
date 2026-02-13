import '../index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// Live games lobby showing active spectatable games
export const GamesLobby = () => {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveSessions = async () => {
    try {
      const resp = await fetch('/api/sessions/active');
      if (!resp.ok) throw new Error('Failed to fetch sessions');
      const data = await resp.json();
      setGames(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const handleWatch = (sessionId: string) => {
    try {
      void requestExpandedMode(new MouseEvent('click'), `watch.html?sessionId=${sessionId}`);
    } catch {
      window.location.href = `watch.html?sessionId=${sessionId}`;
    }
  };

  const handleBack = () => {
    try {
      void requestExpandedMode(new MouseEvent('click'), 'splash');
    } catch {
      window.location.href = 'splash.html';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Live Games</h1>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-lg">Loading active games...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-900 text-red-100 p-4 rounded mb-6">
            {error}
          </div>
        )}

        {!loading && games.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No active games available.</p>
          </div>
        )}

        <div className="space-y-4">
          {games.map((game: any) => (
            <div
              key={game.sessionId}
              className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-500 transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">{game.username}</h2>
                  <div className="text-sm text-gray-400 mt-2 space-y-1">
                    <p>WPM: {game.wpm ?? '—'}</p>
                    <p>Accuracy: {game.accuracy != null ? `${(game.accuracy * 100).toFixed(1)}%` : '—'}</p>
                    <p>Spectators: {game.spectatorCount ?? 0}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleWatch(game.sessionId)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition"
                >
                  Watch
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleBack}
          className="mt-6 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition"
        >
          Back
        </button>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GamesLobby />
  </StrictMode>
);

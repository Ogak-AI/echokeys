import '../index.css';

import { navigateTo } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GetActiveGamesResponse } from '../../shared/types/api';

export const Games = () => {
  const [activeGames, setActiveGames] = useState<
    GetActiveGamesResponse['games'] | null
  >(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveGames = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/active-games');
      if (!response.ok) {
        // Handle server errors gracefully
        if (response.status === 500) {
          // Show "no active games" instead of server error
          setActiveGames([]);
          setError(null);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: GetActiveGamesResponse = await response.json();
      setActiveGames(data.games);
    } catch (e: unknown) {
      console.error('Failed to fetch active games:', e);
      // On any error, show empty games list instead of error message
      setActiveGames([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchActiveGames();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchActiveGames, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
        <h1 className="text-3xl font-bold mb-2">Active Games</h1>
        <p>Loading active games...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
        <h1 className="text-3xl font-bold mb-2">Active Games</h1>
        <p className="text-red-500">Connection issue: {error}</p>
        <div className="flex gap-4">
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700"
            onClick={() => void fetchActiveGames()}
          >
            Retry
          </button>
          <button
            className="bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
            onClick={() => navigateTo('splash')}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Active Games</h1>
        <p className="text-sm opacity-75 mb-4">Live games update every 10 seconds</p>
      </div>
      <div className="mt-4 w-full max-w-md bg-white/5 rounded-lg p-4">
        {activeGames && activeGames.length > 0 ? (
          <div className="space-y-3">
            {activeGames.map((game) => (
              <div
                key={game.username}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                onClick={() => navigateTo(`watch?username=${game.username}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-lg font-medium">{game.username}</span>
                </div>
                <div className="text-sm opacity-75">
                  <span className="bg-blue-600 px-2 py-1 rounded-full text-xs">LIVE</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-lg opacity-80 mb-2">No active games right now</p>
            <p className="text-sm opacity-60">Be the first to start a typing challenge!</p>
            <button
              className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700"
              onClick={() => navigateTo('game')}
            >
              Start Playing
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50"
          onClick={() => void fetchActiveGames()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
        <button
          className="bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={() => navigateTo('splash')}
        >
          Back
        </button>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Games />
  </StrictMode>
);

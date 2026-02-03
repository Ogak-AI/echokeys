import '../index.css';

import { navigateTo, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GetActiveGamesResponse } from '../../shared/types/api';

export const Games = () => {
  const [activeGames, setActiveGames] = useState<
    GetActiveGamesResponse['games'] | null
  >(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleStartPlaying = (e: React.MouseEvent) => {
    console.log('Start Playing button clicked');
    try {
      // Use requestExpandedMode for proper Devvit navigation
      void requestExpandedMode(e.nativeEvent, 'game');
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: try standard navigation
      try {
        void navigateTo('game');
      } catch (navError) {
        console.error('Standard navigation failed:', navError);
        window.location.href = 'game.html';
      }
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.preventDefault();
    console.log('Refresh button clicked');
    await fetchActiveGames();
  };

  const handleBack = (e: React.MouseEvent) => {
    console.log('Back button clicked');
    try {
      // Use requestExpandedMode to go back to splash (like in splash.tsx)
      void requestExpandedMode(e.nativeEvent, 'splash');
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: try standard navigation
      try {
        void navigateTo('splash');
      } catch (navError) {
        console.error('Standard navigation failed:', navError);
        // Final fallback: browser history or direct navigation
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = 'splash.html';
        }
      }
    }
  };

  const handleWatchGame = (username: string, e: React.MouseEvent) => {
    console.log('Watch game clicked for:', username);
    try {
      // Use requestExpandedMode for proper Devvit navigation
      void requestExpandedMode(e.nativeEvent, `watch?username=${username}`);
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: try standard navigation
      try {
        void navigateTo(`watch?username=${username}`);
      } catch (navError) {
        console.error('Standard navigation failed:', navError);
        window.location.href = `watch.html?username=${username}`;
      }
    }
  };

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
        <button
          className="absolute top-4 left-4 bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={handleBack}
        >
          &larr; Back
        </button>
        <h1 className="text-3xl font-bold mb-2">Active Games</h1>
        <p>Loading active games...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
        <button
          className="absolute top-4 left-4 bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={handleBack}
        >
          &larr; Back
        </button>
        <h1 className="text-3xl font-bold mb-2">Active Games</h1>
        <p className="text-red-500">Connection issue: {error}</p>
        <div className="flex gap-4">
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
      <button
        className="absolute top-4 left-4 bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
        onClick={handleBack}
      >
        &larr; Back
      </button>
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
                onClick={(e) => handleWatchGame(game.username, e)}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-lg font-medium">{game.username}</span>
                  </div>
                  {game.challenge && (
                    <p className="text-sm opacity-75 max-w-xs truncate">
                      {game.challenge.text}
                    </p>
                  )}
                </div>
                <div className="text-sm opacity-75">
                  <span className={`px-2 py-1 rounded-full text-xs 
                    ${game.difficulty === 'easy' ? 'bg-green-600' : ''}
                    ${game.difficulty === 'medium' ? 'bg-yellow-600' : ''}
                    ${game.difficulty === 'hard' ? 'bg-red-600' : ''}
                  `}>
                    {game.difficulty.toUpperCase()}
                  </span>
                  <span className="ml-2 bg-blue-600 px-2 py-1 rounded-full text-xs">LIVE</span>
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
              onClick={handleStartPlaying}
            >
              Start Playing
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3">
        <button
          className="absolute top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
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

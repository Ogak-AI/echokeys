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

  useEffect(() => {
    const fetchActiveGames = async () => {
      try {
        const response = await fetch('/api/active-games');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: GetActiveGamesResponse = await response.json();
        setActiveGames(data.games);
      } catch (e: unknown) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('An unknown error occurred');
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchActiveGames();
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
        <p className="text-red-500">Error: {error}</p>
        <button
          className="bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={() => navigateTo('splash')}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Active Games</h1>
      </div>
      <div className="mt-4 w-full max-w-md bg-white/5 rounded-lg p-4">
        {activeGames && activeGames.length > 0 ? (
          <ul>
            {activeGames.map((game) => (
              <li
                key={game.username}
                className="text-lg cursor-pointer hover:text-blue-300"
                onClick={() => navigateTo(`watch?username=${game.username}`)}
              >
                {game.username} is playing...
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm opacity-80">No active games right now.</p>
        )}
      </div>
      <div className="flex items-center justify-center mt-3">
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

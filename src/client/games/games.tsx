import '../index.css';

import { navigateTo, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpectatableGame } from '../../shared/types/api';

const Games = () => {
  const [games, setGames] = useState<SpectatableGame[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch('/api/games');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setGames(data);
      } catch (e: unknown) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('An unknown error occurred.');
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchGames();
  }, []);

  const handleWatch = (username: string) => {
    try {
      void requestExpandedMode({} as any, `watch?username=${username}`);
    } catch {
      void navigateTo(`watch?username=${username}`);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-8">
      <h1 className="text-4xl font-bold mb-8">Active Games</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && !error && (
        <div className="w-full max-w-2xl">
          {games.length === 0 ? (
            <p>No active games right now. Check back later!</p>
          ) : (
            <ul className="space-y-4">
              {games.map((game) => (
                <li
                  key={game.username}
                  className="bg-gray-800 p-4 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <h2 className="text-xl font-semibold">{game.username}'s Game</h2>
                    <p className="text-gray-400">Difficulty: {game.challenge.difficulty}</p>
                  </div>
                  <button
                    onClick={() => handleWatch(game.username)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700"
                  >
                    Watch
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Games />
  </StrictMode>
);

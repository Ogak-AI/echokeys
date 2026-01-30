import '../index.css';

import { navigateTo } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WatchGameResponse } from '../../shared/types/api';

export const Watch = () => {
  const [username, setUsername] = useState<string | null>(null);
  const [gameState, setGameState] = useState<WatchGameResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const usernameParam = params.get('username');
    if (usernameParam) {
      setUsername(usernameParam);
    } else {
      navigateTo('games');
      return;
    }

    const fetchGameState = async () => {
      if (!usernameParam) return;
      try {
        const response = await fetch(`/api/watch-game/${usernameParam}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: WatchGameResponse = await response.json();
        setGameState(data);
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

    void fetchGameState(); // Initial fetch

    const interval = setInterval(fetchGameState, 2000); // Poll every 2 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  if (!username) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
        <h1 className="text-3xl font-bold mb-2">Watching Game</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
        <h1 className="text-3xl font-bold mb-2">Watching {username}'s Game</h1>
        <p>Loading game state...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
        <h1 className="text-3xl font-bold mb-2">Watching {username}'s Game</h1>
        <p className="text-red-500">Error: {error}</p>
        <button
          className="bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={() => navigateTo('games')}
        >
          Back to Active Games
        </button>
      </div>
    );
  }

  // Display the game state
  const renderText = (fullText: string, typedText: string) => {
    return (
      <p className="text-xl leading-relaxed">
        {fullText.split('').map((char, index) => {
          let colorClass = 'text-gray-500'; // Untyped
          if (index < typedText.length) {
            colorClass =
              char === typedText[index] ? 'text-green-400' : 'text-red-500 line-through';
          }
          return (
            <span key={index} className={colorClass}>
              {char}
            </span>
          );
        })}
      </p>
    );
  };

  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Watching {username}'s Game</h1>
        {gameState ? (
          <div className="mt-4 w-full max-w-2xl bg-white/5 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-3">
              Challenge: {gameState.challenge.difficulty}
            </h2>
            <div className="text-left mb-4">{renderText(gameState.challenge.text, gameState.currentInput)}</div>
            <p className="text-lg">WPM: {gameState.wpm}</p>
            <p className="text-lg">Accuracy: {gameState.accuracy}%</p>
            {/* You can add more game state details here */}
          </div>
        ) : (
          <p className="text-sm opacity-80">No game data available for {username}.</p>
        )}
      </div>
      <div className="flex items-center justify-center mt-3">
        <button
          className="bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={() => navigateTo('games')}
        >
          Back to Active Games
        </button>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Watch />
  </StrictMode>
);
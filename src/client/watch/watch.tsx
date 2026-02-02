import '../index.css';

import { navigateTo, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WatchGameResponse } from '../../shared/types/api';

export const Watch = () => {
  const [username, setUsername] = useState<string | null>(null);
  const [gameState, setGameState] = useState<WatchGameResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gameEnded, setGameEnded] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const usernameParam = params.get('username');
    if (usernameParam) {
      setUsername(usernameParam);
    } else {
      try {
        requestExpandedMode(new Event('click'), 'games');
      } catch {
        navigateTo('games');
      }
      return;
    }

    const fetchGameState = async () => {
      if (!usernameParam || gameEnded) return;
      
      try {
        const response = await fetch(`/api/watch-game/${usernameParam}`);
        const data = await response.json();
        
        if (!response.ok) {
          // Check if game ended
          if (data.gameEnded) {
            setGameEnded(true);
            setError(`${usernameParam}'s game has ended`);
            return;
          }
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        
        const gameData: WatchGameResponse = data;
        setGameState(gameData);
        setError(null);
        setRetryCount(0);
        
        // Check if game is completed
        if (gameData.gameCompleted) {
          setGameEnded(true);
          setError(`${usernameParam} has completed the game!`);
        }
        
      } catch (e: unknown) {
        console.error('Watch game fetch error:', e);
        setRetryCount(prev => prev + 1);
        
        if (retryCount >= 3) {
          setGameEnded(true);
          if (e instanceof Error) {
            setError(`Connection lost: ${e.message}`);
          } else {
            setError('Connection lost: Unable to watch game');
          }
        } else {
          if (e instanceof Error) {
            setError(`Reconnecting... (${retryCount + 1}/3): ${e.message}`);
          } else {
            setError(`Reconnecting... (${retryCount + 1}/3)`);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchGameState(); // Initial fetch

    const interval = setInterval(fetchGameState, 2000); // Poll every 2 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, [gameEnded, retryCount]);

  const handleRefresh = () => {
    setError(null);
    setGameEnded(false);
    setRetryCount(0);
    setLoading(true);
  };

  const handleBack = (e: React.MouseEvent) => {
    console.log('Back button clicked in watch');
    try {
      // Use requestExpandedMode to go back to games
      requestExpandedMode(e.nativeEvent, 'games');
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: try standard navigation
      try {
        navigateTo('games');
      } catch (navError) {
        console.error('Standard navigation failed:', navError);
        // Final fallback: browser history or direct navigation
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = 'games.html';
        }
      }
    }
  };

  const handleBackToGames = (e: React.MouseEvent) => {
    console.log('Back to Active Games button clicked');
    try {
      // Use requestExpandedMode to go back to games
      requestExpandedMode(e.nativeEvent, 'games');
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: try standard navigation
      try {
        navigateTo('games');
      } catch (navError) {
        console.error('Standard navigation failed:', navError);
        window.location.href = 'games.html';
      }
    }
  };

  if (!username) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
        <button
          className="absolute top-4 left-4 bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={handleBack}
        >
          &larr; Back
        </button>
        <h1 className="text-3xl font-bold mb-2">Watching Game</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
        <button
          className="absolute top-4 left-4 bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={handleBack}
        >
          &larr; Back
        </button>
        <h1 className="text-3xl font-bold mb-2">Watching {username}'s Game</h1>
        <p>Loading game state...</p>
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
        <h1 className="text-3xl font-bold mb-2">Watching {username}'s Game</h1>
        <p className={`text-lg ${gameEnded ? 'text-yellow-400' : 'text-red-500'}`}>{error}</p>
        {!gameEnded && (
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700"
            onClick={handleRefresh}
          >
            Retry Connection
          </button>
        )}
        <button
          className="bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={handleBackToGames}
        >
          Back to Active Games
        </button>
      </div>
    );
  }

  // Display the game state
  const renderText = (fullText: string, typedText: string) => {
    return (
      <div className="font-mono text-lg leading-relaxed bg-black/30 rounded-lg p-4 text-left">
        {fullText.split('').map((char, index) => {
          let colorClass = 'text-gray-400'; // Untyped
          if (index < typedText.length) {
            colorClass =
              char === typedText[index] ? 'text-green-400' : 'text-red-500 line-through';
          } else if (index === typedText.length) {
            colorClass = 'bg-white text-black animate-pulse'; // Cursor position
          }
          return (
            <span key={index} className={colorClass}>
              {char === '\n' ? '↵' : char}
            </span>
          );
        })}
      </div>
    );
  };

  const getGameStatus = () => {
    if (!gameState) return 'Loading...';
    if (gameState.gameCompleted) return 'Game Completed!';
    
    const progress = Math.round((gameState.currentInput.length / gameState.challenge.text.length) * 100);
    return `In Progress (${progress}%)`;
  };

  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
      <button
        className="absolute top-4 left-4 bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
        onClick={handleBack}
      >
        &larr; Back
      </button>
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Watching {username}'s Game</h1>
        <div className="text-lg mb-4 opacity-90">{getGameStatus()}</div>
        {gameState ? (
          <div className="mt-4 w-full max-w-4xl bg-white/5 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                Challenge: {gameState.challenge.difficulty}
              </h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                gameState.challenge.difficulty === 'easy'
                  ? 'bg-blue-600'
                  : gameState.challenge.difficulty === 'medium'
                    ? 'bg-blue-700'
                    : 'bg-red-600'
              }`}>
                {gameState.challenge.difficulty}
              </span>
            </div>
            
            <div className="mb-6">
              {renderText(gameState.challenge.text, gameState.currentInput)}
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-center bg-white/5 rounded-lg p-4">
              <div>
                <div className="text-2xl font-bold text-blue-400">{gameState.wpm}</div>
                <div className="text-sm opacity-75">WPM</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{gameState.accuracy}%</div>
                <div className="text-sm opacity-75">Accuracy</div>
              </div>
            </div>
            
            {gameState.gameCompleted && (
              <div className="mt-4 p-4 bg-green-600/20 border border-green-600/50 rounded-lg">
                <p className="text-green-400 font-semibold">🎉 Game completed!</p>
                <p className="text-sm opacity-75">Final score: {gameState.wpm} WPM at {gameState.accuracy}% accuracy</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm opacity-80">No game data available for {username}.</p>
        )}
      </div>
      <div className="flex items-center justify-center mt-3">
        <button
          className="bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={handleBackToGames}
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

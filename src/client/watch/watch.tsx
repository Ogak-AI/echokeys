import '../index.css';

import { navigateTo, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { WatchGameResponse } from '../../shared/types/api';
import { io } from 'socket.io-client';

export const Watch = () => {
  const [username, setUsername] = useState<string | null>(null);
  const [gameState, setGameState] = useState<WatchGameResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gameEnded, setGameEnded] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const usernameParam = params.get('username');
    if (!usernameParam) {
      try {
        void requestExpandedMode(new MouseEvent('click'), 'games');
      } catch {
        void navigateTo('games');
      }
      return;
    }
    setUsername(usernameParam);

    const socket = io();

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      socket.emit('watchGame', usernameParam);
      setLoading(false);
    });

    socket.on('gameStateUpdate', (updatedGame: WatchGameResponse) => {
      console.log('Received real-time update:', updatedGame);
      setGameState(updatedGame);
      setGameEnded(updatedGame.gameCompleted || false);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setError('Disconnected from game. Attempting to reconnect...');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket.IO connection error:', err);
      setError(`Connection error: ${err.message}. Retrying...`);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleBack = useCallback((e: React.MouseEvent) => {
    console.log('Back button clicked in watch');
    try {
      void requestExpandedMode(e.nativeEvent, 'games');
    } catch (error) {
      console.error('Navigation error:', error);
      try {
        void navigateTo('games');
      } catch (navError) {
        console.error('Standard navigation failed:', navError);
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = 'games.html';
        }
      }
    }
  }, []);

  const handleBackToGames = useCallback((e: React.MouseEvent) => {
    console.log('Back to Active Games button clicked');
    try {
      void requestExpandedMode(e.nativeEvent, 'games');
    } catch (error) {
      console.error('Navigation error:', error);
      try {
        void navigateTo('games');
      } catch (navError) {
        console.error('Standard navigation failed:', navError);
        window.location.href = 'games.html';
      }
    }
  }, []);

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

  if (loading && !gameState) {
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
  const renderText = (fullText: string, typedText: string, errorIndexes: number[]) => {
    return (
      <div className="bg-black/30 rounded-lg p-2 sm:p-4 mb-4 font-mono text-base sm:text-lg md:text-xl leading-relaxed min-h-20 sm:min-h-24 overflow-hidden flex-shrink-0 md:flex-none">
        {(() => {
          const charIndex = typedText.length;
          // Show 100-120 characters total, with cursor roughly in the middle
          const charsToShow = 110; // characters to display
          const beforeCursor = 40; // characters before cursor
          const startIdx = Math.max(0, charIndex - beforeCursor);
          const endIdx = Math.min(fullText.length, startIdx + charsToShow);

          const displayText = fullText.substring(startIdx, endIdx);

          return displayText.split('').map((char, idx) => {
            const charAbsIndex = startIdx + idx;
            let className = 'text-gray-300';
            if (charAbsIndex < typedText.length) {
              if (errorIndexes.includes(charAbsIndex)) {
                className = 'text-red-500 bg-red-500/30 font-semibold';
              } else if (typedText[charAbsIndex] === char) {
                className = 'text-white font-semibold';
              }
            } else if (charAbsIndex === typedText.length && !gameState?.gameCompleted) {
              className = 'bg-white text-black font-bold animate-pulse';
            }
            return (
              <span key={idx} className={className}>
                {char === '\n' ? '↵' : char}
              </span>
            );
          });
        })()}
      </div>
    );
  };

  const getGameStatus = () => {
    if (!gameState) return 'Loading...';
    if (gameState.gameCompleted) return 'Game Completed!';

    const progress = Math.round(
      (gameState.currentInput.length / gameState.challenge.text.length) * 100
    );
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
              <h2 className="text-xl font-semibold">Challenge: {gameState.challenge.difficulty}</h2>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  gameState.challenge.difficulty === 'easy'
                    ? 'bg-blue-600'
                    : gameState.challenge.difficulty === 'medium'
                      ? 'bg-blue-700'
                      : 'bg-red-600'
                }`}
              >
                {gameState.challenge.difficulty}
              </span>
            </div>

            <div className="mb-6">
              {renderText(
                gameState.challenge.text,
                gameState.currentInput,
                gameState.errorIndexes || []
              )}
              <div className="w-full bg-gray-600 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{
                    width: `${(gameState.currentInput.length / gameState.challenge.text.length) * 100}%`,
                  }}
                ></div>
              </div>
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
                <p className="text-sm opacity-75">
                  Final score: {gameState.wpm} WPM at {gameState.accuracy}% accuracy
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm opacity-80">No game data available for {username}.</p>
        )}
      </div>
      <div className="flex items-center justify-center mt-3">
        <button
          className="absolute top-4 right-4 bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
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

import '../index.css';

import { navigateTo, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import { GameStateUpdate, PlayerJoined, PlayerLeft, GameFinished } from '../../shared/types/socket';

interface WatchGameState {
  players: Array<{
    id: string;
    username: string;
    currentInput: string;
    wpm: number;
    accuracy: number;
    startTime: number;
    errorIndexes: number[];
    isFinished: boolean;
  }>;
  challenge: {
    id: string;
    text: string;
    difficulty: 'easy' | 'medium' | 'hard';
  };
  gameCompleted: boolean;
}

export const Watch = () => {
  const [username, setUsername] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<WatchGameState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gameEnded, setGameEnded] = useState<boolean>(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const usernameParam = params.get('username');
    const roomIdParam = params.get('roomId');

    if (!usernameParam && !roomIdParam) {
      try {
        void requestExpandedMode({} as any, 'games');
      } catch {
        void navigateTo('games');
      }
      return;
    }

    setUsername(usernameParam);
    setRoomId(roomIdParam);

    // Connect to Socket.IO server
    const socketConnection = io();

    socketConnection.on('connect', () => {
      console.log('Connected to Socket.IO server');
      setLoading(false);
      setError(null);

      // Join the game as spectator
      if (roomIdParam) {
        socketConnection.emit('joinGame', {
          roomId: roomIdParam,
          username: usernameParam || 'Anonymous',
          asSpectator: true
        });
      }
    });

    socketConnection.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
      setError('Disconnected from game. Attempting to reconnect...');
    });

    socketConnection.on('joinedGame', (data: { roomId: string; asSpectator: boolean }) => {
      console.log('Successfully joined game as spectator:', data);
    });

    socketConnection.on('message', (message: GameStateUpdate | PlayerJoined | PlayerLeft | GameFinished) => {
      console.log('Received Socket.IO message:', message);

      if (message.type === 'gameState') {
        // Convert the game state to our expected format
        const watchGameState: WatchGameState = {
          players: message.players,
          challenge: message.players[0]?.currentInput ? {
            id: 'current-challenge',
            text: '', // We don't have the full challenge text in updates
            difficulty: 'medium' // Default, could be enhanced
          } : {
            id: 'current-challenge',
            text: 'Loading challenge...',
            difficulty: 'medium'
          },
          gameCompleted: message.players.some(p => p.isFinished)
        };
        setGameState(watchGameState);
        setGameEnded(watchGameState.gameCompleted);
        setError(null);
      } else if (message.type === 'gameFinished') {
        setGameEnded(true);
        setError('Game has finished!');
      }
    });

    socketConnection.on('error', (error: { message: string }) => {
      console.error('Socket.IO error:', error);
      setError(error.message);
    });

    setSocket(socketConnection);

    // Initial fetch to get room info if needed
    if (roomIdParam) {
      // For now, we'll rely on Socket.IO updates
      // Could add an API call here to get initial room state
    }

    return () => {
      socketConnection.disconnect();
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
  const renderText = (fullText: string, players: WatchGameState['players']) => {
    if (!players.length) return <div>No players in this game</div>;

    // For simplicity, show the first player's progress
    const player = players[0];
    return (
      <div className="bg-black/30 rounded-lg p-2 sm:p-4 mb-4 font-mono text-base sm:text-lg md:text-xl leading-relaxed min-h-20 sm:min-h-24 overflow-hidden flex-shrink-0 md:flex-none">
        {(() => {
          const charIndex = player.currentInput.length;
          // Show 100-120 characters total, with cursor roughly in the middle
          const charsToShow = 110; // characters to display
          const beforeCursor = 40; // characters before cursor
          const startIdx = Math.max(0, charIndex - beforeCursor);
          const endIdx = Math.min(fullText.length, startIdx + charsToShow);

          const displayText = fullText.substring(startIdx, endIdx);

          return displayText.split('').map((char, idx) => {
            const charAbsIndex = startIdx + idx;
            let className = 'text-gray-300';
            if (charAbsIndex < player.currentInput.length) {
              if (player.errorIndexes.includes(charAbsIndex)) {
                className = 'text-red-500 bg-red-500/30 font-semibold';
              } else if (player.currentInput[charAbsIndex] === char) {
                className = 'text-white font-semibold';
              }
            } else if (charAbsIndex === player.currentInput.length && !player.isFinished) {
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

    if (gameState.players.length === 0) return 'Waiting for players...';

    const player = gameState.players[0];
    const progress = Math.round(
      (player.currentInput.length / (gameState.challenge?.text?.length || 1)) * 100
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
        <h1 className="text-3xl font-bold mb-2">Watching Game</h1>
        <div className="text-lg mb-4 opacity-90">{getGameStatus()}</div>
        {gameState ? (
          <div className="mt-4 w-full max-w-4xl bg-white/5 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Live Game</h2>
              <div className="flex gap-2">
                {gameState.players.map((player, idx) => (
                  <span key={player.id} className="px-3 py-1 rounded-full text-sm font-medium bg-blue-600">
                    {player.username}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-6">
              {renderText(gameState.challenge.text || 'Loading challenge...', gameState.players)}
              {gameState.players.length > 0 && (
                <div className="w-full bg-gray-600 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{
                      width: `${(gameState.players[0].currentInput.length / (gameState.challenge.text?.length || 1)) * 100}%`,
                    }}
                  ></div>
                </div>
              )}
            </div>

            {gameState.players.length > 0 && (
              <div className="grid grid-cols-2 gap-4 text-center bg-white/5 rounded-lg p-4">
                <div>
                  <div className="text-2xl font-bold text-blue-400">{gameState.players[0].wpm}</div>
                  <div className="text-sm opacity-75">WPM</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">{gameState.players[0].accuracy}%</div>
                  <div className="text-sm opacity-75">Accuracy</div>
                </div>
              </div>
            )}

            {gameState.gameCompleted && (
              <div className="mt-4 p-4 bg-green-600/20 border border-green-600/50 rounded-lg">
                <p className="text-green-400 font-semibold">🎉 Game completed!</p>
                {gameState.players.map(player => (
                  <p key={player.id} className="text-sm opacity-75">
                    {player.username}: {player.wpm} WPM at {player.accuracy}% accuracy
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm opacity-80">No game data available.</p>
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

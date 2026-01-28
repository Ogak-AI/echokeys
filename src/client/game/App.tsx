import { navigateTo } from '@devvit/web/client';
import { useTypingGame } from '../hooks/useTypingGame';

export const App = () => {
  const {
    username,
    userStats,
    dailyChallenge,
    loading,
    gameStarted,
    gameFinished,
    currentInput,
    wpm,
    accuracy,
    leaderboard,
    showLeaderboard,
    startGame,
    updateInput,
    fetchLeaderboard,
    toggleLeaderboard,
    resetGame,
  } = useTypingGame();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (showLeaderboard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 text-white p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-6">Leaderboard</h1>
          <div className="bg-white/10 rounded-lg p-4 mb-4">
            {leaderboard.length === 0 ? (
              <p className="text-center">No scores yet!</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, index) => (
                  <div key={index} className="flex justify-between items-center bg-white/5 rounded p-2">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-yellow-300">#{index + 1}</span>
                      <span>{entry.username}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{entry.wpm} WPM</div>
                      <div className="text-sm opacity-75">{entry.accuracy}% acc</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-4 justify-center">
            <button
              onClick={toggleLeaderboard}
              className="bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100"
            >
              Back to Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold mb-2">EchoKeys</h1>
          <p className="text-lg opacity-90">Welcome, {username}!</p>
        </div>

        {/* Stats */}
        {userStats && (
          <div className="bg-white/10 rounded-lg p-4 mb-6">
            <h2 className="text-xl font-semibold mb-3">Your Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{userStats.bestWPM}</div>
                <div className="text-sm opacity-75">Best WPM</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{userStats.bestAccuracy}%</div>
                <div className="text-sm opacity-75">Best Acc</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{userStats.totalGames}</div>
                <div className="text-sm opacity-75">Games</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{userStats.streak}</div>
                <div className="text-sm opacity-75">Streak</div>
              </div>
            </div>
          </div>
        )}

        {/* Daily Challenge */}
        {dailyChallenge && (
          <div className="bg-white/20 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Daily Challenge</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                dailyChallenge.difficulty === 'easy' ? 'bg-green-500' :
                dailyChallenge.difficulty === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
              }`}>
                {dailyChallenge.difficulty}
              </span>
            </div>

            {!gameStarted ? (
              <div className="text-center">
                <p className="mb-4 opacity-90">{dailyChallenge.text}</p>
                <button
                  onClick={startGame}
                  className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors"
                >
                  Start Typing!
                </button>
              </div>
            ) : (
              <div className="flex flex-col h-screen md:h-auto">
                {/* Typing Area - Fixed on mobile, normal on desktop */}
                <div className="bg-black/30 rounded-lg p-4 mb-4 font-mono text-lg leading-relaxed min-h-24 overflow-hidden flex-shrink-0 md:flex-none">
                  {(() => {
                    // Split text into lines
                    const lines = dailyChallenge.text.split('\n');
                    const charIndex = currentInput.length;
                    
                    // Find which line and position within the line the cursor is on
                    let currentLine = 0;
                    let charCount = 0;
                    for (let i = 0; i < lines.length; i++) {
                      const lineLength = lines[i].length + 1; // +1 for newline
                      if (charCount + lineLength > charIndex) {
                        currentLine = i;
                        break;
                      }
                      charCount += lineLength;
                    }
                    
                    // Show current line and 2 lines ahead (3 lines total)
                    const startLine = Math.max(0, currentLine);
                    const endLine = Math.min(lines.length - 1, currentLine + 2);
                    
                    return lines.slice(startLine, endLine + 1).map((line, lineIdx) => {
                      const actualLineIdx = startLine + lineIdx;
                      // Calculate the character index for this line
                      let lineCharStart = 0;
                      for (let i = 0; i < actualLineIdx; i++) {
                        lineCharStart += lines[i].length + 1; // +1 for newline
                      }
                      
                      return (
                        <div key={actualLineIdx}>
                          {line.split('').map((char, charIdx) => {
                            const charAbsIndex = lineCharStart + charIdx;
                            let className = 'text-gray-400';
                            if (charAbsIndex < currentInput.length) {
                              className = currentInput[charAbsIndex] === char ? 'text-green-400' : 'text-red-400 bg-red-500/20';
                            } else if (charAbsIndex === currentInput.length) {
                              className = 'bg-white text-black animate-pulse';
                            }
                            return (
                              <span key={charIdx} className={className}>
                                {char}
                              </span>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Input */}
                <textarea
                  value={currentInput}
                  onChange={(e) => updateInput(e.target.value)}
                  onTouchStart={(e) => e.currentTarget.scrollIntoView(false)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg p-3 text-white placeholder-white/50 focus:outline-none focus:border-white/50 flex-shrink-0 md:flex-none"
                  placeholder="Start typing here..."
                  rows={3}
                  disabled={gameFinished}
                />

                {/* Stats during game */}
                <div className="flex justify-between items-center mt-4 flex-shrink-0 md:flex-none">
                  <div className="text-lg">
                    WPM: <span className="font-bold">{wpm}</span>
                  </div>
                  <div className="text-lg">
                    Accuracy: <span className="font-bold">{accuracy}%</span>
                  </div>
                </div>

                {/* Game finished */}
                {gameFinished && (
                  <div className="mt-6 text-center flex-grow md:flex-none">
                    <div className="bg-white/10 rounded-lg p-4 mb-4">
                      <h3 className="text-2xl font-bold mb-2">Great job!</h3>
                      <div className="grid grid-cols-2 gap-4 text-lg">
                        <div>
                          <div className="font-semibold">{wpm} WPM</div>
                          <div className="text-sm opacity-75">Words per minute</div>
                        </div>
                        <div>
                          <div className="font-semibold">{accuracy}%</div>
                          <div className="text-sm opacity-75">Accuracy</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 justify-center">
                      <button
                        onClick={resetGame}
                        className="bg-white text-blue-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={() => void fetchLeaderboard()}
                        className="bg-yellow-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-yellow-600"
                      >
                        Leaderboard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-sm opacity-75">
          <button
            onClick={() => navigateTo('https://www.reddit.com/r/Devvit')}
            className="hover:opacity-100"
          >
            Powered by Devvit
          </button>
        </div>
      </div>
    </div>
  );
};

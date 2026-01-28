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
    showDifficultySelect,
    isMuted,
    startGame,
    selectDifficulty,
    updateInput,
    fetchLeaderboard,
    toggleLeaderboard,
    toggleMute,
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
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-black text-white p-4">
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
                      <span className="font-bold text-white">#{index + 1}</span>
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
              className="bg-white text-blue-900 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100"
            >
              Back to Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Difficulty Selection Screen
  if (showDifficultySelect && !gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-black text-white p-4">
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-screen">
          <h1 className="text-4xl font-bold mb-4 text-center">KeyScripture</h1>
          <p className="text-xl opacity-90 mb-12 text-center">Choose your difficulty level</p>
          
          <div className="space-y-4 w-full max-w-md">
            <button
              onClick={() => selectDifficulty('easy')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
            >
              Easy
            </button>
            <button
              onClick={() => selectDifficulty('medium')}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
            >
              Medium
            </button>
            <button
              onClick={() => selectDifficulty('hard')}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
            >
              Hard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-black text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="text-center flex-1">
            <h1 className="text-4xl font-bold mb-2">KeyScripture</h1>
            <p className="text-lg opacity-90">Welcome, {username}!</p>
          </div>
          <button
            onClick={toggleMute}
            className="ml-4 px-4 py-2 rounded-lg font-semibold transition-colors"
            title={isMuted ? "Unmute" : "Mute"}
            style={{
              backgroundColor: isMuted ? '#666' : '#fff',
              color: isMuted ? '#fff' : '#1e3a8a',
            }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
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
                dailyChallenge.difficulty === 'easy' ? 'bg-blue-600' :
                dailyChallenge.difficulty === 'medium' ? 'bg-blue-700' : 'bg-red-600'
              }`}>
                {dailyChallenge.difficulty}
              </span>
            </div>

            {!gameStarted ? (
              <div className="text-center">
                <p className="mb-4 opacity-90 text-sm max-h-20 overflow-hidden">{dailyChallenge.text.substring(0, 150)}...</p>
                <button
                  onClick={startGame}
                  className="bg-white text-blue-900 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors"
                >
                  Start Typing!
                </button>
              </div>
            ) : (
              <div className="flex flex-col h-auto">
                {/* Typing Area - Shows ~100-120 characters at a time */}
                <div className="bg-black/30 rounded-lg p-2 sm:p-4 mb-4 font-mono text-base sm:text-lg md:text-xl leading-relaxed min-h-20 sm:min-h-24 overflow-hidden flex-shrink-0 md:flex-none">
                  {(() => {
                    const charIndex = currentInput.length;
                    // Show 100-120 characters total, with cursor roughly in the middle
                    const charsToShow = 110; // characters to display
                    const beforeCursor = 40; // characters before cursor
                    const startIdx = Math.max(0, charIndex - beforeCursor);
                    const endIdx = Math.min(dailyChallenge.text.length, startIdx + charsToShow);
                    
                    const displayText = dailyChallenge.text.substring(startIdx, endIdx);
                    
                    return displayText.split('').map((char, idx) => {
                      const charAbsIndex = startIdx + idx;
                      let className = 'text-gray-300';
                      if (charAbsIndex < currentInput.length) {
                        className = currentInput[charAbsIndex] === char ? 'text-white font-semibold' : 'text-red-500 bg-red-500/30 font-semibold';
                      } else if (charAbsIndex === currentInput.length) {
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

                {/* Input */}
                <textarea
                  value={currentInput}
                  onChange={(e) => updateInput(e.target.value)}
                  onTouchStart={(e) => e.currentTarget.scrollIntoView(false)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg p-3 sm:p-4 text-lg sm:text-xl md:text-lg text-white placeholder-white/50 focus:outline-none focus:border-white/50 flex-shrink-0 md:flex-none"
                  placeholder="Start typing here..."
                  rows={5}
                  disabled={gameFinished}
                />

                {/* Stats during game */}
                <div className="flex justify-between items-center mt-2 flex-shrink-0 md:flex-none">
                  <div className="text-base sm:text-lg md:text-2xl">
                    WPM: <span className="font-bold">{wpm}</span>
                  </div>
                  <div className="text-base sm:text-lg md:text-2xl">
                    Accuracy: <span className="font-bold">{accuracy}%</span>
                  </div>
                </div>

                {/* Game finished */}
                {gameFinished && (
                  <div className="mt-4 text-center">
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
                        className="bg-white text-blue-900 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={() => void fetchLeaderboard()}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700"
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

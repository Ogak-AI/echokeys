import { context, requestExpandedMode } from '../shims/devvit-web-client';
import { useTypingGame } from '../hooks/useTypingGame';
import { CONTENT_TYPES, DIFFICULTY_CONFIG, LANGUAGES } from '../../shared/types/index';
import type { ChallengeContentType, Difficulty, Language } from '../../shared/types/index';

export const App = () => {
  const {
    username,
    challenge,
    loading,
    gameStarted,
    gameFinished,
    currentInput,
    wpm,
    accuracy,
    prompt,
    language,
    contentType,
    domain,
    difficulty,
    showSetup,
    timeLeftSeconds,
    isMuted,
    isGenerating,
    error,
    leaderboard,
    scoreSummary,
    startGame,
    generateChallenge,
    updatePrompt,
    updateLanguage,
    updateContentType,
    updateDomain,
    updateDifficulty,
    updateInput,
    resetGame,
    toggleMute,
  } = useTypingGame();

  const handleBack = async () => {
    try {
      await requestExpandedMode(new MouseEvent('click'), 'splash');
    } catch {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'splash.html';
      }
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-xl">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-slate-900 to-black p-4 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-blue-200">Echokeys</p>
            <h1 className="text-3xl font-semibold">Developer typing speed game</h1>
            <p className="mt-2 text-sm text-slate-300">Submit a prompt, generate fresh content, and race to type it accurately.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleMute} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25" title={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? 'Muted' : 'Sound'}
            </button>
            <button onClick={handleBack} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10">Back</button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
            {showSetup && !challenge && !isGenerating && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold">Generate your next challenge</h2>
                  <p className="mt-2 text-sm text-slate-400">Describe what you want generated, pick a context, and start typing.</p>
                </div>
                <label className="block text-sm font-medium text-slate-200">
                  Prompt
                  <textarea
                    value={prompt}
                    onChange={(event) => updatePrompt(event.target.value)}
                    placeholder="Build a binary search tree in Rust"
                    className="mt-2 min-h-28 w-full rounded-xl border border-white/15 bg-slate-800/80 p-3 text-sm text-white outline-none"
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-200">
                    Content type
                    <select value={contentType} onChange={(event) => updateContentType(event.target.value as ChallengeContentType)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-800/80 p-3 text-sm text-white">
                      {Object.entries(CONTENT_TYPES).map(([value, config]) => (
                        <option key={value} value={value}>{config.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-200">
                    Difficulty
                    <select value={difficulty} onChange={(event) => updateDifficulty(event.target.value as Difficulty)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-800/80 p-3 text-sm text-white">
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-200">
                    Domain
                    <input value={domain} onChange={(event) => updateDomain(event.target.value)} placeholder="growth, legal, ai, finance" className="mt-2 w-full rounded-xl border border-white/15 bg-slate-800/80 p-3 text-sm text-white outline-none" />
                  </label>
                  {contentType === 'code' && (
                    <label className="text-sm font-medium text-slate-200">
                      Language
                      <select value={language} onChange={(event) => updateLanguage(event.target.value as Language)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-800/80 p-3 text-sm text-white">
                        {Object.entries(LANGUAGES).map(([value, config]) => (
                          <option key={value} value={value}>{config.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <p className="text-sm text-slate-400">{CONTENT_TYPES[contentType].description}</p>
                {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
                <button onClick={() => void generateChallenge()} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500">
                  {isGenerating ? 'Generating…' : 'Generate challenge'}
                </button>
              </div>
            )}

            {isGenerating && (
              <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-8 text-center">
                <h2 className="text-2xl font-semibold">Building your challenge…</h2>
                <p className="mt-2 text-slate-300">The generator is preparing a fresh snippet for you to type.</p>
              </div>
            )}

            {!showSetup && challenge && !gameStarted && !gameFinished && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-blue-200">Ready</p>
                      <h2 className="text-xl font-semibold">{challenge.concept || 'Generated challenge'}</h2>
                    </div>
                    <span className="rounded-full bg-blue-600/70 px-3 py-1 text-sm font-medium uppercase">{challenge.difficulty}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">Context: {challenge.language || 'unknown'} • {challenge.lineCount || 0} lines</p>
                  <p className="mt-2 text-sm text-slate-400">Time limit: {Math.floor(DIFFICULTY_CONFIG[difficulty].timeLimitSeconds / 60)} min</p>
                </div>
                <button onClick={startGame} className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 hover:bg-slate-100">Start typing</button>
                <button onClick={resetGame} className="w-full rounded-xl border border-white/15 px-4 py-3 font-semibold text-slate-200 hover:bg-white/10">Generate a different prompt</button>
              </div>
            )}

            {gameStarted && challenge && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-400">Type the generated content exactly as shown.</p>
                    <div className="flex flex-wrap gap-3 text-sm font-medium">
                      <span>WPM: {wpm}</span>
                      <span>Accuracy: {accuracy}%</span>
                      <span>Time left: {Math.floor(timeLeftSeconds / 60)}:{String(timeLeftSeconds % 60).padStart(2, '0')}</span>
                    </div>
                  </div>
                  <div className="min-h-48 rounded-xl border border-white/10 bg-black/50 p-4 font-mono text-sm leading-7">
                    {challenge.text.split('').map((char, index) => {
                      const typedChar = currentInput[index];
                      const isCorrect = typedChar === char;
                      const isTyped = index < currentInput.length;
                      const className = isTyped ? (isCorrect ? 'text-emerald-400' : 'text-red-400') : 'text-slate-300';
                      return <span key={`${char}-${index}`} className={className}>{char}</span>;
                    })}
                  </div>
                </div>
                <textarea value={currentInput} onChange={(event) => updateInput(event.target.value)} disabled={gameFinished} rows={8} className="w-full rounded-xl border border-white/15 bg-slate-800/80 p-3 text-sm text-white outline-none" placeholder="Start typing here..." />
              </div>
            )}

            {gameFinished && challenge && (
              <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
                <h2 className="text-2xl font-semibold">Challenge completed</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-900/70 p-3">
                    <p className="text-sm text-slate-400">WPM</p>
                    <p className="text-2xl font-semibold">{wpm}</p>
                  </div>
                  <div className="rounded-xl bg-slate-900/70 p-3">
                    <p className="text-sm text-slate-400">Accuracy</p>
                    <p className="text-2xl font-semibold">{accuracy}%</p>
                  </div>
                  <div className="rounded-xl bg-slate-900/70 p-3">
                    <p className="text-sm text-slate-400">Score</p>
                    <p className="text-2xl font-semibold">{scoreSummary?.score ?? 0}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                  <span>Weekly rank: {scoreSummary?.weekly_rank ?? '—'}</span>
                  <span>All-time rank: {scoreSummary?.all_time_rank ?? '—'}</span>
                </div>
                <button onClick={resetGame} className="rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 hover:bg-slate-100">Generate another challenge</button>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
              <h2 className="text-xl font-semibold">Weekly leaderboard</h2>
              <p className="mt-2 text-sm text-slate-400">Real-time rankings update as scores are submitted.</p>
              <div className="mt-4 space-y-2">
                {leaderboard.length === 0 ? (
                  <p className="rounded-xl bg-white/5 p-3 text-sm text-slate-400">No scores yet. Be the first to set a weekly record.</p>
                ) : (
                  leaderboard.map((entry) => (
                    <div key={entry.user_id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold">#{entry.rank} {entry.username}</p>
                        <p className="text-slate-400">{entry.challenges_completed} challenges</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{entry.score}</p>
                        <p className="text-slate-400">{entry.accuracy}% • {entry.best_wpm} WPM</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
              <h2 className="text-xl font-semibold">How it works</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li>• Describe the content you want generated.</li>
                <li>• Pick a language and difficulty.</li>
                <li>• Type the generated snippet as fast and accurately as possible.</li>
                <li>• Climb the weekly and all-time leaderboards.</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};

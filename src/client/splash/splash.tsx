import '../index.css';
import { context, requestExpandedMode } from '../shims/devvit-web-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const Splash = () => {
  const username = context?.username ?? 'Typist';

  const handlePlay = (e: React.MouseEvent) => {
    void requestExpandedMode(e.nativeEvent, 'game');
  };

  const handleLeaderboard = (e: React.MouseEvent) => {
    void requestExpandedMode(e.nativeEvent, 'leaderboard');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ background: '#1e1e1e', color: '#d4d4d4' }}>

      {/* Title area */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="text-3xl">⌨️</span>
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: '#007acc' }}>
            Echokeys
          </h1>
        </div>
        <p className="text-sm" style={{ color: '#858585' }}>
          Type. Race. Dominate the leaderboard.
        </p>
      </div>

      {/* Welcome card */}
      <div className="w-full max-w-md rounded p-6 mb-6"
           style={{ background: '#252526', border: '1px solid #3c3c3c' }}>
        <div className="text-center">
          <p className="text-lg mb-1">
            Welcome, <span className="font-semibold" style={{ color: '#4ec9b0' }}>{username}</span>
          </p>
          <p className="text-xs" style={{ color: '#858585' }}>
            Submit a prompt, type the generated content, and compete against other Redditors.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={handlePlay}
                className="vsc-btn vsc-btn-lg w-full justify-center text-base font-semibold">
          ▶ Start Challenge
        </button>
        <button onClick={handleLeaderboard}
                className="vsc-btn-ghost vsc-btn vsc-btn-lg w-full justify-center text-base">
          🏆 Leaderboard
        </button>
      </div>

      {/* Footer */}
      <p className="mt-10 text-xs" style={{ color: '#3c3c3c' }}>
        Powered by Devvit • VS Code Dark Theme
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode><Splash /></StrictMode>
);

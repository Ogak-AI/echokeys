import '../index.css';

import { navigateTo } from '@devvit/web/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Splash = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">EchoKeys</h1>
        <p className="text-lg mb-4">The Ultimate Typing Adventure</p>
        <p className="text-sm opacity-90">Test your typing skills with Reddit-inspired challenges!</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-2xl font-semibold">
          Welcome, {context.username ?? 'Typist'}! 👋
        </h2>
        <p className="text-center text-sm opacity-90">
          Ready to echo the keys and conquer the challenges?
        </p>
      </div>
      <div className="flex items-center justify-center mt-5">
        <button
          className="flex items-center justify-center bg-white text-red-500 w-auto h-12 rounded-full cursor-pointer transition-all px-6 font-semibold hover:bg-gray-100 hover:scale-105"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Start Typing!
        </button>
      </div>
      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 text-[0.8em] text-white/80">
        <button
          className="cursor-pointer hover:text-white"
          onClick={() => navigateTo('https://developers.reddit.com/docs')}
        >
          Docs
        </button>
        <span className="text-white/50">|</span>
        <button
          className="cursor-pointer hover:text-white"
          onClick={() => navigateTo('https://www.reddit.com/r/Devvit')}
        >
          r/Devvit
        </button>
        <span className="text-white/50">|</span>
        <button
          className="cursor-pointer hover:text-white"
          onClick={() => navigateTo('https://discord.com/invite/R7yu2wh9Qz')}
        >
          Discord
        </button>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);

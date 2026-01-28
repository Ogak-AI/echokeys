import '../index.css';

import { navigateTo } from '@devvit/web/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Splash = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">KeyScripture</h1>
        <p className="text-base mb-4">Scripture Typing Challenge</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-xl font-semibold">
          Welcome, {context.username ?? 'Typist'}!
        </h2>
      </div>
      <div className="flex items-center justify-center mt-5">
        <button
          className="flex items-center justify-center bg-white text-blue-900 w-auto h-12 rounded-full cursor-pointer transition-all px-6 font-semibold hover:bg-gray-100 hover:scale-105"
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

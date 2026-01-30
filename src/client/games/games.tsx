import '../index.css';

import { navigateTo } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Games = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-gradient-to-br from-blue-900 to-black text-white px-4 sm:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Active Games</h1>
      </div>
      <div className="mt-4 w-full max-w-md bg-white/5 rounded-lg p-4">
        <p className="text-sm opacity-80">No active games right now.</p>
      </div>
      <div className="flex items-center justify-center mt-3">
        <button
          className="bg-transparent border border-white text-white px-4 py-2 rounded-full hover:bg-white/10"
          onClick={() => navigateTo('splash')}
        >
          Back
        </button>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Games />
  </StrictMode>
);

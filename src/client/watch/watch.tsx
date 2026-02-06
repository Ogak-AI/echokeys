import '../index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// Watch page removed. Redirect back to the main game/splash to avoid Socket.IO.
export const WatchStub = () => {
  useEffect(() => {
    try {
      void requestExpandedMode(new MouseEvent('click'), 'splash');
    } catch {
      window.location.href = 'splash.html';
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-900 to-black text-white">
      <div>Watch mode removed — redirecting...</div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WatchStub />
  </StrictMode>
);

import '../index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// Games list removed — redirect back to splash/game to keep single-player flow.
export const GamesStub = () => {
  useEffect(() => {
    try {
      void requestExpandedMode(new MouseEvent('click'), 'splash');
    } catch {
      window.location.href = 'splash.html';
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
      <div>Active games mode removed — redirecting...</div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GamesStub />
  </StrictMode>
);

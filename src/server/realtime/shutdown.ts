import http from 'http';
import { gracefulCleanup } from './cleanup';

export function attachShutdown(server: http.Server) {
  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    try {
      server.close(() => console.log('HTTP server closed'));
      await gracefulCleanup();
    } catch (err) {
      console.error('Error during shutdown', err);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

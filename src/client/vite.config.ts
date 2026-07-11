import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        splash: resolve(__dirname, 'splash.html'),
        game: resolve(__dirname, 'game.html'),
        games: resolve(__dirname, 'games.html'),
        watch: resolve(__dirname, 'watch.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});

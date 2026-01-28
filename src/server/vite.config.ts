import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  ssr: {
    noExternal: true,
  },
  logLevel: 'warn',
  build: {
    ssr: 'index.ts',
    outDir: '../../dist/server',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    rollupOptions: {
      external: [...builtinModules],

      output: {
        format: 'cjs',
        entryFileNames: 'index.cjs',
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    {
      name: 'copy-challenges',
      apply: 'build',
      writeBundle() {
        // Copy challenges directory to dist
        const src = resolve(__dirname, 'challenges');
        const dest = resolve(__dirname, '../../dist/server/challenges');
        mkdirSync(dest, { recursive: true });
        
        const fs = require('node:fs');
        const files = fs.readdirSync(src);
        for (const file of files) {
          if (file.endsWith('.txt')) {
            copyFileSync(resolve(src, file), resolve(dest, file));
          }
        }
      },
    },
  ],
});

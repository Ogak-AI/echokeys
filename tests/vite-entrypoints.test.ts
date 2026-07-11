import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../src/client/vite.config.ts');

test('client build config includes Devvit entry HTML files', async () => {
  const result = await loadConfigFromFile({ command: 'build', mode: 'production' }, configPath);
  const input = result?.config.build?.rollupOptions?.input as Record<string, string> | undefined;

  assert.ok(input, 'Expected Vite build.rollupOptions.input to be configured');
  assert.equal(input.splash, path.resolve(__dirname, '../src/client/splash.html'));
  assert.equal(input.game, path.resolve(__dirname, '../src/client/game.html'));
  assert.equal(input.games, path.resolve(__dirname, '../src/client/games.html'));
  assert.equal(input.watch, path.resolve(__dirname, '../src/client/watch.html'));
});

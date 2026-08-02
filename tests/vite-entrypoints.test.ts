import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../src/client/vite.config.ts');

describe('client vite config', () => {
  it('includes Devvit entry HTML files in rollupOptions.input', async () => {
    const result = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      configPath
    );
    const input = result?.config.build?.rollupOptions?.input as Record<string, string> | undefined;

    expect(input).toBeTruthy();

    const clientDir = path.dirname(configPath);
    expect(path.resolve(clientDir, input!.splash)).toBe(path.resolve(clientDir, 'splash.html'));
    expect(path.resolve(clientDir, input!.game)).toBe(path.resolve(clientDir, 'game.html'));
    expect(path.resolve(clientDir, input!.leaderboard)).toBe(path.resolve(clientDir, 'leaderboard.html'));
  });
});

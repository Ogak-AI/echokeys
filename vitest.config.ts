import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    // You might need to adjust this depending on where your test files are located
    // For example, if they are only in src/server, you could use:
    // include: ['src/server/**/*.test.ts'],
  },
});

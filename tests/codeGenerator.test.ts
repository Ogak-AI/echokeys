import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContent } from '../src/server/services/contentGenerator.ts';

test('generateContent falls back to deterministic code when no API token is configured', async () => {
  const result = await generateContent('recursive binary search', 'easy', '');

  assert.ok(result.content.length > 0);
  assert.ok(result.lineCount >= 25 && result.lineCount <= 50);
  assert.equal(result.domain, 'code');
  assert.match(result.content, /function |const |console\.log/);
});

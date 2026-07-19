import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContent } from '../src/server/services/contentGenerator.ts';

const emptyConfig = {
  provider: 'huggingface',
  huggingface: { apiKey: '', model: 'Qwen/Qwen2.5-Coder-7B-Instruct' },
  groq: { apiKey: '', model: '' },
};

test('generateContent falls back to deterministic code when generation fails', async () => {
  // Empty key + unreachable HF will fail and use fallback
  const result = await generateContent('recursive binary search', emptyConfig);

  assert.ok(result.content.length > 0);
  assert.ok(result.lineCount >= 25 && result.lineCount <= 50);
  assert.equal(result.domain, 'code');
  assert.match(result.content, /function |const |console\.log/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCode } from '../src/server/services/codeGenerator.js';

test('generateCode falls back to deterministic code when no API token is configured', async () => {
  delete process.env.HF_API_TOKEN;

  const result = await generateCode('sum a list of numbers', 'python', 'easy');

  assert.ok(result.code.length > 0);
  assert.ok(result.lineCount >= 1);
  assert.match(result.code, /def |class |import /);
});

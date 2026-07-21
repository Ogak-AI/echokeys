import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateContent,
  resolveFreeIntelligentGeminiModel,
  DEFAULT_GEMINI_MODEL,
  FREE_INTELLIGENT_GEMINI_MODELS,
  buildGenerationMessages,
} from '../src/server/services/contentGenerator.ts';

const emptyConfig = {
  apiKey: '',
  model: DEFAULT_GEMINI_MODEL,
};

test('generateContent falls back to deterministic code when generation fails', async () => {
  // Empty key → Gemini fails immediately → fallback content
  const result = await generateContent('recursive binary search', emptyConfig);

  assert.ok(result.content.length > 0);
  assert.ok(result.lineCount >= 25 && result.lineCount <= 50);
  assert.equal(result.domain, 'code');
  assert.match(result.content, /function |const |console\.log/);
});

test('generateContent gemini path falls back without a key', async () => {
  const result = await generateContent('legal brief on negligence', {
    apiKey: '',
    model: 'gemini-3.6-flash',
  });

  assert.ok(result.content.length > 0);
  assert.equal(result.domain, 'legal');
  assert.match(result.content, /MEMORANDUM|Statement of Facts|Counsel/i);
});

test('resolveFreeIntelligentGeminiModel allowlists free intelligent models only', () => {
  for (const model of FREE_INTELLIGENT_GEMINI_MODELS) {
    assert.equal(resolveFreeIntelligentGeminiModel(model), model);
  }
  assert.equal(resolveFreeIntelligentGeminiModel('models/gemini-2.5-pro'), 'gemini-2.5-pro');
  // Paid / lite / OpenAI / unknown → default free intelligent model
  assert.equal(resolveFreeIntelligentGeminiModel('gpt-5.4-mini'), DEFAULT_GEMINI_MODEL);
  assert.equal(resolveFreeIntelligentGeminiModel('gemini-3.5-flash-lite'), DEFAULT_GEMINI_MODEL);
  assert.equal(resolveFreeIntelligentGeminiModel('gemini-3.1-pro-preview'), DEFAULT_GEMINI_MODEL);
  assert.equal(resolveFreeIntelligentGeminiModel(undefined), DEFAULT_GEMINI_MODEL);
});

test('buildGenerationMessages requires multilingual native output', () => {
  const msgs = buildGenerationMessages('Un ensayo sobre el clima en México', 'prose');
  assert.match(msgs[1]!.content, /same language/i);
  assert.match(msgs[1]!.content, /Never force English/i);
  assert.match(msgs[1]!.content, /diacritics|script/i);
});

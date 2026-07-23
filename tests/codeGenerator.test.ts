import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateContent,
  resolveFreeIntelligentGeminiModel,
  DEFAULT_GEMINI_MODEL,
  FREE_INTELLIGENT_GEMINI_MODELS,
  buildGenerationMessages,
  parseWordTarget,
  clampWordTarget,
  resolveLengthTarget,
  enforceWordCount,
  MIN_WORD_TARGET,
  MAX_WORD_TARGET,
} from '../src/server/services/contentGenerator.ts';
import { countWords } from '../src/shared/utils/antiCheat.ts';

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

test('parseWordTarget extracts explicit word counts from prompts', () => {
  assert.equal(parseWordTarget('Write a 20 words content about rain'), 20);
  assert.equal(parseWordTarget('about 150 words on negligence'), 150);
  assert.equal(parseWordTarget('exactly 50 words'), 50);
  assert.equal(parseWordTarget('a 100-word essay on climate'), 100);
  assert.equal(parseWordTarget('generate 30 words about cats'), 30);
  assert.equal(parseWordTarget('word count: 40'), 40);
  assert.equal(parseWordTarget('words: 12'), 12);
  assert.equal(parseWordTarget('Write a recursive binary search'), null);
  assert.equal(parseWordTarget('20 something without unit'), null);
});

test('clampWordTarget enforces product bounds', () => {
  assert.equal(clampWordTarget(5), MIN_WORD_TARGET);
  assert.equal(clampWordTarget(9999), MAX_WORD_TARGET);
  assert.equal(clampWordTarget(20), 20);
});

test('resolveLengthTarget prefers words when specified, else lines', () => {
  const words = resolveLengthTarget('prompt me 20 words of poetry');
  assert.equal(words.mode, 'words');
  if (words.mode === 'words') assert.equal(words.count, 20);

  const lines = resolveLengthTarget('Write a legal brief on negligence');
  assert.equal(lines.mode, 'lines');
  if (lines.mode === 'lines') {
    assert.equal(lines.min, 25);
    assert.equal(lines.max, 50);
  }
});

test('enforceWordCount truncates surplus words exactly', () => {
  const long =
    'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
  // Under the clamped target → leave as-is
  assert.equal(enforceWordCount(long, 20), long);
  // Exact clamp at MIN_WORD_TARGET (10)
  assert.equal(countWords(enforceWordCount(long, 10)), 10);
  assert.equal(
    enforceWordCount(long, 12),
    'one two three four five six seven eight nine ten eleven twelve'
  );
  // Below product minimum still clamps up to MIN_WORD_TARGET before truncating
  assert.equal(countWords(enforceWordCount(long, 5)), MIN_WORD_TARGET);
});

test('generateContent honors 20-word request on fallback path', async () => {
  const result = await generateContent('Write 20 words content about morning rain', emptyConfig);
  assert.equal(result.wordCount, 20);
  assert.equal(countWords(result.content), 20);
});

test('buildGenerationMessages includes hard word limit when requested', () => {
  const msgs = buildGenerationMessages('Write 20 words about coffee', 'prose');
  assert.match(msgs[1]!.content, /EXACTLY 20 words/i);
  assert.doesNotMatch(msgs[1]!.content, /minimum 25/i);
});

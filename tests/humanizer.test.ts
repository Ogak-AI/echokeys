import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHumanizerSystemPrompt,
  getHumanizerRules,
  HUMANIZER_PROSE_RULES,
  HUMANIZER_CODE_RULES,
} from '../src/shared/utils/humanizer.ts';
import { buildGenerationMessages } from '../src/server/services/contentGenerator.ts';

test('prose humanizer rules cover core AI tells from the skill', () => {
  for (const tell of [
    'pivotal',
    'testament',
    'delve',
    'I hope this helps',
    "Let's dive in",
    'serves as',
    'experts say',
    'evolving landscape',
  ]) {
    assert.match(HUMANIZER_PROSE_RULES, new RegExp(tell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('code domain uses lighter humanizer rules', () => {
  assert.equal(getHumanizerRules('code'), HUMANIZER_CODE_RULES);
  assert.equal(getHumanizerRules('prose'), HUMANIZER_PROSE_RULES);
  assert.equal(getHumanizerRules('legal'), HUMANIZER_PROSE_RULES);
  assert.equal(getHumanizerRules('marketing'), HUMANIZER_PROSE_RULES);
});

test('buildGenerationMessages always attaches humanizer as system message', () => {
  const prose = buildGenerationMessages('Write a legal brief on negligence', 'legal');
  assert.equal(prose.length, 2);
  assert.equal(prose[0]!.role, 'system');
  assert.equal(prose[1]!.role, 'user');
  assert.equal(prose[0]!.content, buildHumanizerSystemPrompt('legal'));
  assert.match(prose[0]!.content, /must not sound AI-generated/i);
  assert.match(prose[0]!.content, /delve/i);
  assert.match(prose[0]!.content, /Global language rules/i);
  assert.match(prose[1]!.content, /legal brief on negligence/);
  assert.match(prose[1]!.content, /humanizer rules/i);
  assert.match(prose[1]!.content, /Never force English/i);

  const code = buildGenerationMessages('recursive binary search', 'code');
  assert.equal(code[0]!.content, buildHumanizerSystemPrompt('code'));
  assert.match(code[0]!.content, /syntactically correct/i);
  assert.doesNotMatch(code[0]!.content, /Significance inflation/);
});

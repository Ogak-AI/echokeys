import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHumanizerSystemPrompt,
  getHumanizerRules,
  HUMANIZER_PROSE_RULES,
  HUMANIZER_CODE_RULES,
} from '../src/shared/utils/humanizer.ts';

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

test('buildHumanizerSystemPrompt wraps domain rules for agent use', () => {
  const prose = buildHumanizerSystemPrompt('legal');
  assert.match(prose, /must not sound AI-generated/i);
  assert.match(prose, /delve/i);
  assert.match(prose, /Global language rules/i);
  assert.ok(prose.includes(HUMANIZER_PROSE_RULES.slice(0, 40)));

  const code = buildHumanizerSystemPrompt('code');
  assert.match(code, /syntactically correct/i);
  assert.doesNotMatch(code, /Significance inflation/);
});

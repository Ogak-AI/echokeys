import test from 'node:test';
import assert from 'node:assert/strict';
import { generateChallengeContent } from '../src/server/services/challengeContent.ts';

test('generateChallengeContent creates domain-aware typing content', () => {
  const result = generateChallengeContent('draft a launch email', 'marketing', 'growth', 'medium');

  assert.ok(result.text.length > 0);
  assert.ok(result.lineCount >= 1);
  assert.match(result.text.toLowerCase(), /marketing|growth|launch|email/);
});

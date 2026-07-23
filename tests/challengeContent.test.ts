import test from 'node:test';
import assert from 'node:assert/strict';
import { detectContentDomain } from '../src/shared/utils/contentDomain.ts';

test('detectContentDomain labels exact challenge text by domain', () => {
  assert.equal(detectContentDomain('Write a recursive binary search in Rust'), 'code');
  assert.equal(detectContentDomain('Draft a sales contract with a liability clause'), 'legal');
  assert.equal(detectContentDomain('Create a marketing pitch for productivity app'), 'marketing');
  assert.equal(detectContentDomain('Explain system architecture technical guide'), 'technical');
  assert.equal(detectContentDomain('Write a creative story opening'), 'creative');
  assert.equal(detectContentDomain('Random daily journal entry about typing'), 'prose');
});

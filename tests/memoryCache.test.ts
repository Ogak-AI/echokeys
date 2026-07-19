import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryCache } from '../src/server/services/memoryCache.ts';

test('memory cache stores, retrieves, and expires items', async () => {
  memoryCache.set('test-key', { foo: 'bar' }, 50);
  
  const hit = memoryCache.get<{ foo: string }>('test-key');
  assert.ok(hit);
  assert.equal(hit.foo, 'bar');

  await new Promise(resolve => setTimeout(resolve, 100));

  const miss = memoryCache.get<{ foo: string }>('test-key');
  assert.equal(miss, null);
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { memoryCache } from '../src/server/services/memoryCache.js';

afterEach(() => {
  memoryCache.clear();
});

describe('memoryCache', () => {
  it('stores and retrieves a value', () => {
    memoryCache.set('key1', { foo: 'bar' }, 10_000);
    const hit = memoryCache.get<{ foo: string }>('key1');
    expect(hit).toBeTruthy();
    expect(hit!.foo).toBe('bar');
  });

  it('has() returns true for a live entry', () => {
    memoryCache.set('key2', 42, 10_000);
    expect(memoryCache.has('key2')).toBe(true);
  });

  it('has() returns false for a missing key', () => {
    expect(memoryCache.has('nonexistent')).toBe(false);
  });

  it('get() returns null for a missing key', () => {
    expect(memoryCache.get('nonexistent')).toBeNull();
  });

  it('expires an item after its TTL (using fake timers)', () => {
    vi.useFakeTimers();
    memoryCache.set('expiring', 'value', 50);

    expect(memoryCache.get('expiring')).toBe('value');

    vi.advanceTimersByTime(100);

    expect(memoryCache.get('expiring')).toBeNull();
    expect(memoryCache.has('expiring')).toBe(false);

    vi.useRealTimers();
  });

  it('delete() removes an entry', () => {
    memoryCache.set('del-key', 'x', 10_000);
    memoryCache.delete('del-key');
    expect(memoryCache.get('del-key')).toBeNull();
  });

  it('clear() removes all entries', () => {
    memoryCache.set('a', 1, 10_000);
    memoryCache.set('b', 2, 10_000);
    memoryCache.clear();
    expect(memoryCache.get('a')).toBeNull();
    expect(memoryCache.get('b')).toBeNull();
  });

  it('overwrites an existing key on set()', () => {
    memoryCache.set('over', 'first', 10_000);
    memoryCache.set('over', 'second', 10_000);
    expect(memoryCache.get('over')).toBe('second');
  });
});

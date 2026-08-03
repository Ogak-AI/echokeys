/**
 * Process-local TTL cache for Redis-backed reads.
 * Bounded so long-lived Devvit isolates cannot grow unbounded from unique keys.
 */
class MemoryCache {
  private cache = new Map<string, { value: unknown; expiry: number }>();
  private readonly maxEntries: number;
  private opsSinceSweep = 0;

  constructor(maxEntries = 500) {
    this.maxEntries = Math.max(32, maxEntries);
  }

  private sweepExpired(now = Date.now()): void {
    for (const [key, item] of this.cache) {
      if (now > item.expiry) this.cache.delete(key);
    }
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxEntries) return;
    // Map iteration order is insertion order — drop oldest first.
    const overflow = this.cache.size - this.maxEntries;
    let removed = 0;
    for (const key of this.cache.keys()) {
      this.cache.delete(key);
      removed++;
      if (removed >= overflow) break;
    }
  }

  private maybeSweep(): void {
    this.opsSinceSweep++;
    if (this.opsSinceSweep < 64) return;
    this.opsSinceSweep = 0;
    this.sweepExpired();
  }

  has(key: string): boolean {
    this.maybeSweep();
    const item = this.cache.get(key);
    if (!item) return false;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  get<T>(key: string): T | null {
    this.maybeSweep();
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.maybeSweep();
    // Refresh insertion order for this key (treat as newest).
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, {
      value,
      expiry: Date.now() + Math.max(0, ttlMs),
    });
    this.evictIfNeeded();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.opsSinceSweep = 0;
  }

  /** Test / diagnostics helper. */
  size(): number {
    return this.cache.size;
  }
}

export const memoryCache = new MemoryCache();

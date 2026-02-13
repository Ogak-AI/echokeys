type Key = string;

const buckets = new Map<Key, { tokens: number; last: number }>();

export function rateLimit(key: Key, limit = 10, perSeconds = 1): boolean {
  // token bucket: limit tokens per perSeconds
  const now = Date.now();
  const refillInterval = perSeconds * 1000;
  const bucket = buckets.get(key) || { tokens: limit, last: now };
  const elapsed = now - bucket.last;
  const refill = (elapsed / refillInterval) * limit;
  bucket.tokens = Math.min(limit, bucket.tokens + refill);
  bucket.last = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return true;
  }
  buckets.set(key, bucket);
  return false;
}

export function clearRateLimiter() {
  buckets.clear();
}

/**
 * Layer 2 — Permanent data for EchoKeys.
 *
 * Responsibilities:
 * - Freeze period / tournament standings as immutable snapshots
 * - Track schema migrations (additive only; never destructive)
 * - Integrity checks (checksum, orphan indexes, freeze status)
 *
 * Hard rules:
 * - Never redis.del permanent keys
 * - Never overwrite a frozen snapshot with different content
 * - Empty freeze of non-empty is refused
 * - Existing live leaderboard keys (lb:*) remain the source of truth for
 *   current periods; frozen copies live under perm:snap:*
 */

import type { LeaderboardEntry } from '../../shared/types/index.js';
import type {
  FrozenSnapshot,
  IntegrityIssue,
  IntegrityReport,
  MigrationRecord,
  PermanenceMeta,
  SnapshotKind,
} from '../../shared/types/permanence.js';
import {
  PERMANENCE_SCHEMA_VERSION,
} from '../../shared/types/permanence.js';
import type { RedisLike } from './leaderboard.js';
import { memoryCache } from './memoryCache.js';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

function metaKey(communityId: string): string {
  return `perm:meta:${communityId}`;
}

function snapKey(communityId: string, kind: SnapshotKind, periodKey: string): string {
  return `perm:snap:${communityId}:${kind}:${periodKey}`;
}

function snapIndexKey(communityId: string, kind: SnapshotKind): string {
  return `perm:snapidx:${communityId}:${kind}`;
}

// ---------------------------------------------------------------------------
// JSON helpers (local; same contract as leaderboard)
// ---------------------------------------------------------------------------

async function readJson<T>(redis: RedisLike, key: string, fallback: T): Promise<T> {
  const raw = await redis.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(redis: RedisLike, key: string, value: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Checksum (stable, dependency-free)
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit over a deterministic ranking signature.
 * Not cryptographic — used for corruption / accidental rewrite detection.
 */
export function checksumEntries(entries: LeaderboardEntry[]): string {
  const parts = entries.map(
    (e) =>
      `${e.rank ?? 0}|${e.username}|${e.bestCorrectWords ?? 0}|${e.bestTimeSeconds ?? 0}|${e.accuracy ?? 0}|${e.bestWpm ?? 0}`
  );
  const payload = parts.join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Meta + migrations
// ---------------------------------------------------------------------------

export async function getPermanenceMeta(
  redis: RedisLike,
  communityId: string
): Promise<PermanenceMeta | null> {
  return readJson<PermanenceMeta | null>(redis, metaKey(communityId), null);
}

export async function ensurePermanenceMeta(
  redis: RedisLike,
  communityId: string,
  now = Date.now()
): Promise<PermanenceMeta> {
  const key = metaKey(communityId);
  const existing = await getPermanenceMeta(redis, communityId);
  if (existing && existing.schemaVersion >= PERMANENCE_SCHEMA_VERSION) {
    return existing;
  }

  if (existing) {
    // Additive upgrade only — never wipe migration history.
    const migration: MigrationRecord = {
      id: `mig-${existing.schemaVersion}-to-${PERMANENCE_SCHEMA_VERSION}`,
      fromVersion: existing.schemaVersion,
      toVersion: PERMANENCE_SCHEMA_VERSION,
      appliedAt: now,
      ok: true,
      notes: 'Additive permanence schema bump; no data deleted',
    };
    const next: PermanenceMeta = {
      ...existing,
      schemaVersion: PERMANENCE_SCHEMA_VERSION,
      updatedAt: now,
      migrations: [...(existing.migrations ?? []), migration],
    };
    await writeJson(redis, key, next);
    memoryCache.delete(key);
    return next;
  }

  const created: PermanenceMeta = {
    v: 1,
    schemaVersion: PERMANENCE_SCHEMA_VERSION,
    communityId,
    createdAt: now,
    updatedAt: now,
    migrations: [
      {
        id: 'mig-init-v2',
        fromVersion: 0,
        toVersion: PERMANENCE_SCHEMA_VERSION,
        appliedAt: now,
        ok: true,
        notes: 'Initialize permanence layer metadata',
      },
    ],
  };
  await writeJson(redis, key, created);
  return created;
}

// ---------------------------------------------------------------------------
// Freeze snapshots (write-once)
// ---------------------------------------------------------------------------

export type FreezeResult =
  | { ok: true; snapshot: FrozenSnapshot; created: boolean; reason: 'created' | 'idempotent' }
  | { ok: false; error: string; existing?: FrozenSnapshot };

/**
 * Freeze a period board permanently.
 * - First write seals frozen=true with checksum
 * - Re-run with same content → ok, idempotent
 * - Re-run with different content → refused (protects winners)
 */
export async function freezeSnapshot(
  redis: RedisLike,
  input: {
    communityId: string;
    kind: SnapshotKind;
    periodKey: string;
    entries: LeaderboardEntry[];
    label?: string;
    now?: number;
  }
): Promise<FreezeResult> {
  const { communityId, kind, periodKey, label } = input;
  const now = input.now ?? Date.now();
  const entries = input.entries.map((e) => ({
    ...e,
    badges: [...(e.badges ?? [])],
  }));

  if (entries.length === 0) {
    return { ok: false, error: 'Refusing to freeze empty snapshot' };
  }

  await ensurePermanenceMeta(redis, communityId, now);

  const key = snapKey(communityId, kind, periodKey);
  const existing = await readJson<FrozenSnapshot | null>(redis, key, null);
  const checksum = checksumEntries(entries);

  if (existing?.frozen) {
    if (existing.checksum === checksum) {
      return { ok: true, snapshot: existing, created: false, reason: 'idempotent' };
    }
    console.error(
      `[Permanence] Refusing to overwrite frozen ${key} (checksum ${existing.checksum} vs ${checksum})`
    );
    return {
      ok: false,
      error: 'Frozen snapshot already exists with different content',
      existing,
    };
  }

  const snapshot: FrozenSnapshot = {
    v: 1,
    id: `${kind}:${periodKey}`,
    kind,
    periodKey,
    communityId,
    entries,
    frozenAt: now,
    frozen: true,
    checksum,
    label,
    schemaVersion: PERMANENCE_SCHEMA_VERSION,
  };

  await writeJson(redis, key, snapshot);
  memoryCache.delete(key);

  // Index — never truncate to empty; cap growth at 2000 periods (~38 years of weeks).
  const idxKey = snapIndexKey(communityId, kind);
  const idx = await readJson<string[]>(redis, idxKey, []);
  if (!idx.includes(periodKey)) {
    idx.unshift(periodKey);
    if (idx.length > 2000) idx.length = 2000;
    await writeJson(redis, idxKey, idx);
  }

  console.log(
    `[Permanence] Froze ${kind} ${periodKey} for ${communityId} (${entries.length} entries, ${checksum})`
  );
  return { ok: true, snapshot, created: true, reason: 'created' };
}

export async function getFrozenSnapshot(
  redis: RedisLike,
  communityId: string,
  kind: SnapshotKind,
  periodKey: string
): Promise<FrozenSnapshot | null> {
  const key = snapKey(communityId, kind, periodKey);
  const snap = await readJson<FrozenSnapshot | null>(redis, key, null);
  if (!snap || !snap.frozen) return null;
  return snap;
}

export async function listFrozenPeriods(
  redis: RedisLike,
  communityId: string,
  kind: SnapshotKind,
  limit = 52
): Promise<string[]> {
  const idx = await readJson<string[]>(redis, snapIndexKey(communityId, kind), []);
  return idx.slice(0, Math.max(1, limit));
}

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------

export async function verifyPermanenceIntegrity(
  redis: RedisLike,
  communityId: string,
  now = Date.now()
): Promise<IntegrityReport> {
  const issues: IntegrityIssue[] = [];
  const meta = await getPermanenceMeta(redis, communityId);

  if (!meta) {
    issues.push({
      code: 'META_MISSING',
      severity: 'warn',
      message: 'Permanence meta not initialized (will be created on next freeze or ensure)',
    });
  } else if (meta.schemaVersion < PERMANENCE_SCHEMA_VERSION) {
    issues.push({
      code: 'SCHEMA_BEHIND',
      severity: 'warn',
      message: `Schema ${meta.schemaVersion} < ${PERMANENCE_SCHEMA_VERSION}`,
    });
  }

  let snapshotCount = 0;
  const kinds: SnapshotKind[] = ['weekly', 'monthly', 'yearly', 'tournament', 'season'];

  for (const kind of kinds) {
    const periods = await listFrozenPeriods(redis, communityId, kind, 2000);
    for (const periodKey of periods) {
      const snap = await getFrozenSnapshot(redis, communityId, kind, periodKey);
      if (!snap) {
        issues.push({
          code: 'ORPHAN_INDEX',
          severity: 'error',
          message: `Index lists ${kind}/${periodKey} but snapshot missing`,
          key: snapKey(communityId, kind, periodKey),
        });
        continue;
      }
      snapshotCount++;
      if (!snap.frozen) {
        issues.push({
          code: 'NOT_FROZEN',
          severity: 'error',
          message: `Snapshot ${kind}/${periodKey} missing frozen flag`,
          key: snap.id,
        });
      }
      if (!snap.entries?.length) {
        issues.push({
          code: 'EMPTY_FROZEN',
          severity: 'error',
          message: `Frozen snapshot ${kind}/${periodKey} has no entries`,
          key: snap.id,
        });
      }
      const expected = checksumEntries(snap.entries ?? []);
      if (snap.checksum !== expected) {
        issues.push({
          code: 'CHECKSUM_MISMATCH',
          severity: 'error',
          message: `Checksum mismatch for ${kind}/${periodKey}`,
          key: snap.id,
        });
      }
    }
  }

  // Live all-time board presence (soft check)
  const alltime = await readJson<LeaderboardEntry[]>(
    redis,
    `lb:${communityId}:alltime`,
    []
  );
  if (alltime.length === 0 && snapshotCount > 0) {
    issues.push({
      code: 'ALLTIME_EMPTY_WITH_HISTORY',
      severity: 'warn',
      message: 'Frozen history exists but all-time board is empty (restore may be needed)',
    });
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return {
    ok: !hasError,
    checkedAt: now,
    communityId,
    schemaVersion: meta?.schemaVersion ?? 0,
    snapshotCount,
    issues,
  };
}

/**
 * Run on install/upgrade: ensure meta exists, verify integrity, never wipe data.
 */
export async function bootstrapPermanence(
  redis: RedisLike,
  communityId: string
): Promise<{ meta: PermanenceMeta; integrity: IntegrityReport }> {
  const meta = await ensurePermanenceMeta(redis, communityId);
  const integrity = await verifyPermanenceIntegrity(redis, communityId);
  if (!integrity.ok) {
    console.error(
      `[Permanence] Integrity issues on bootstrap: ${integrity.issues.map((i) => i.code).join(', ')}`
    );
  } else {
    console.log(
      `[Permanence] Bootstrap ok schema=${meta.schemaVersion} snapshots=${integrity.snapshotCount}`
    );
  }
  return { meta, integrity };
}

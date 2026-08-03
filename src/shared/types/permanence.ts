/**
 * Permanent-layer types for EchoKeys long-lived competitive history.
 *
 * Layer model:
 *  L1 Live gameplay — TTL race sessions, caches (may expire)
 *  L2 Permanent — frozen snapshots, profiles, scores, tournaments (never expire)
 *  L3 Analytics — derived / regenerable summaries
 *
 * Snapshots are write-once once frozen. Re-runs with identical content are
 * idempotent; divergent overwrites of frozen data are refused.
 */

import type { LeaderboardEntry } from './index.js';

/** Schema version of the permanent store (bump on additive migrations only). */
export const PERMANENCE_SCHEMA_VERSION = 2;

export type SnapshotKind = 'weekly' | 'monthly' | 'yearly' | 'tournament' | 'season';

/**
 * Immutable historical leaderboard snapshot.
 * Once frozen=true is written, content must not change.
 */
export type FrozenSnapshot = {
  /** Document format version. */
  v: 1;
  id: string;
  kind: SnapshotKind;
  /** Period key: week YYYY-MM-DD, month YYYY-MM, year YYYY, or tournament id. */
  periodKey: string;
  communityId: string;
  entries: LeaderboardEntry[];
  /** Unix ms when the freeze was sealed. */
  frozenAt: number;
  frozen: true;
  /**
   * Deterministic checksum of ranked content (username, correctWords, time).
   * Used for corruption detection and idempotent re-freeze.
   */
  checksum: string;
  /** Optional human label (tournament name, season name). */
  label?: string;
  /** App/schema version that produced this freeze. */
  schemaVersion: number;
};

export type MigrationRecord = {
  id: string;
  fromVersion: number;
  toVersion: number;
  appliedAt: number;
  ok: boolean;
  notes?: string;
};

export type PermanenceMeta = {
  v: 1;
  schemaVersion: number;
  communityId: string;
  createdAt: number;
  updatedAt: number;
  migrations: MigrationRecord[];
};

export type IntegrityIssue = {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  key?: string;
};

export type IntegrityReport = {
  ok: boolean;
  checkedAt: number;
  communityId: string;
  schemaVersion: number;
  snapshotCount: number;
  issues: IntegrityIssue[];
};

/** Career counters stored on player profile (permanent, merge-only). */
export type CareerStats = {
  /** Every score submit (ranked or not). */
  totalRaces: number;
  /** Submits that were leaderboard-eligible. */
  rankedRaces: number;
  /** Times finished #1 on a frozen weekly snapshot. */
  weeklyWins: number;
  /** Times finished top-3 on a frozen weekly snapshot. */
  weeklyTop3: number;
  /** Tournament standings #1 freezes. */
  tournamentWins: number;
  firstRaceAt: number | null;
  lastRaceAt: number | null;
};

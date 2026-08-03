/**
 * Subreddit wiki backup for Echokeys leaderboards.
 *
 * Devvit Redis is wiped on uninstall. Wiki pages live on the subreddit and
 * survive reinstall, so we mirror ranks there and restore on install/upgrade.
 */
import type { RedditClient } from '@devvit/reddit';
import type { RedisLike } from './leaderboard.js';
import {
  backupHasData,
  exportLeaderboardBackup,
  importLeaderboardBackup,
  type LeaderboardBackupV1,
} from './leaderboard.js';

/** WikiPagePermissionLevel.MODS_ONLY — only mods may edit/view. */
const WIKI_MODS_ONLY = 2;

/** Unlisted wiki page — mods only. */
export const LEADERBOARD_WIKI_PAGE = 'echokeys/leaderboard-backup';

const MARKER_START = '<!-- echokeys-lb-v1 -->';
const MARKER_END = '<!-- /echokeys-lb-v1 -->';
/** Stay under typical wiki size limits. */
const MAX_WIKI_CHARS = 450_000;
/** Minimum gap between score-triggered backups (ms). */
export const BACKUP_THROTTLE_MS = 5 * 60 * 1000;

/** Returns the per-subreddit throttle key so communities do not share a throttle. */
export function backupThrottleKey(subredditId: string): string {
  return `echokeys:wiki-backup:last:${subredditId}`;
}

export type WikiReddit = Pick<
  RedditClient,
  'getWikiPage' | 'createWikiPage' | 'updateWikiPage' | 'updateWikiPageSettings'
>;

function bareSubredditName(name: string): string {
  return String(name).replace(/^r\//i, '').trim();
}

function encodeBackup(backup: LeaderboardBackupV1): string {
  const json = JSON.stringify(backup);
  return [
    '# Echokeys leaderboard backup',
    '',
    'Managed automatically by the **Echokeys** app. Do not edit this page.',
    'Leaderboards are restored from here after reinstall so ranks are not lost.',
    '',
    MARKER_START,
    json,
    MARKER_END,
    '',
  ].join('\n');
}

export function parseBackupContent(content: string): LeaderboardBackupV1 | null {
  if (!content) return null;

  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END);
  let raw: string | null = null;

  if (start >= 0 && end > start) {
    raw = content.slice(start + MARKER_START.length, end).trim();
  } else {
    // Fallback: fenced JSON or bare JSON
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) raw = fence[1].trim();
    else {
      const brace = content.indexOf('{');
      const last = content.lastIndexOf('}');
      if (brace >= 0 && last > brace) raw = content.slice(brace, last + 1);
    }
  }

  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LeaderboardBackupV1;
    if (parsed?.v !== 1 || typeof parsed.subredditId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function readWikiBackup(
  redditApi: WikiReddit,
  subredditName: string
): Promise<LeaderboardBackupV1 | null> {
  const sub = bareSubredditName(subredditName);
  try {
    const page = await redditApi.getWikiPage(sub, LEADERBOARD_WIKI_PAGE);
    return parseBackupContent(page.content);
  } catch {
    return null;
  }
}

async function writeWikiBackup(
  redditApi: WikiReddit,
  subredditName: string,
  backup: LeaderboardBackupV1,
  reason: string
): Promise<boolean> {
  const sub = bareSubredditName(subredditName);
  let content = encodeBackup(backup);

  if (content.length > MAX_WIKI_CHARS) {
    // Drop older weekly archives first, then monthly, keep all-time + profiles.
    const trimmed: LeaderboardBackupV1 = {
      ...backup,
      weeklyArchives: {},
      weeklyArchiveIndex: backup.weeklyArchiveIndex.slice(0, 4),
      monthly: Object.fromEntries(Object.entries(backup.monthly).slice(0, 6)),
      monthlyIndex: backup.monthlyIndex.slice(0, 6),
      yearly: Object.fromEntries(Object.entries(backup.yearly).slice(0, 3)),
    };
    for (const wk of trimmed.weeklyArchiveIndex) {
      if (backup.weeklyArchives[wk]) trimmed.weeklyArchives[wk] = backup.weeklyArchives[wk]!;
    }
    content = encodeBackup(trimmed);
    if (content.length > MAX_WIKI_CHARS) {
      const minimal: LeaderboardBackupV1 = {
        v: 1,
        subredditId: backup.subredditId,
        savedAt: backup.savedAt,
        alltime: backup.alltime,
        weekly: backup.weekly,
        weeklyArchives: {},
        weeklyArchiveIndex: [],
        monthly: {},
        monthlyIndex: [],
        yearly: {},
        profiles: backup.profiles,
      };
      content = encodeBackup(minimal);
    }
  }

  if (content.length > MAX_WIKI_CHARS) {
    console.error(
      `[WikiBackup] Backup still too large (${content.length} chars); skipping write`
    );
    return false;
  }

  try {
    try {
      await redditApi.getWikiPage(sub, LEADERBOARD_WIKI_PAGE);
      await redditApi.updateWikiPage({
        subredditName: sub,
        page: LEADERBOARD_WIKI_PAGE,
        content,
        reason,
      });
    } catch {
      await redditApi.createWikiPage({
        subredditName: sub,
        page: LEADERBOARD_WIKI_PAGE,
        content,
        reason,
      });
    }

    try {
      await redditApi.updateWikiPageSettings({
        subredditName: sub,
        page: LEADERBOARD_WIKI_PAGE,
        listed: false,
        permLevel: WIKI_MODS_ONLY,
      });
    } catch (err) {
      console.warn('[WikiBackup] Could not lock wiki page to mods-only:', err);
    }

    return true;
  } catch (err) {
    console.error('[WikiBackup] Failed to write wiki page:', err);
    return false;
  }
}

/** Export Redis → wiki. Returns false if nothing to save or write failed. */
export async function backupLeaderboardToWiki(
  redis: RedisLike,
  redditApi: WikiReddit,
  subredditId: string,
  subredditName: string,
  reason = 'Echokeys leaderboard backup'
): Promise<boolean> {
  const backup = await exportLeaderboardBackup(redis, subredditId);
  if (!backupHasData(backup)) {
    console.log('[WikiBackup] Skip backup — no leaderboard data yet');
    return false;
  }
  const ok = await writeWikiBackup(redditApi, subredditName, backup, reason);
  if (ok) {
    const throttleKey = backupThrottleKey(subredditId);
    await redis.set(throttleKey, String(Date.now()));
    console.log(
      `[WikiBackup] Saved ranks to wiki r/${bareSubredditName(subredditName)}/${LEADERBOARD_WIKI_PAGE} (${backup.alltime.length} all-time, ${backup.profiles.length} profiles)`
    );
  }
  return ok;
}

/**
 * Throttled backup after score submits — still durable, avoids wiki rate limits.
 */
export async function backupLeaderboardToWikiThrottled(
  redis: RedisLike,
  redditApi: WikiReddit,
  subredditId: string,
  subredditName: string
): Promise<boolean> {
  const throttleKey = backupThrottleKey(subredditId);
  const lastRaw = await redis.get(throttleKey);
  const last = lastRaw ? parseInt(lastRaw, 10) : 0;
  if (Number.isFinite(last) && Date.now() - last < BACKUP_THROTTLE_MS) {
    return false;
  }
  return backupLeaderboardToWiki(
    redis,
    redditApi,
    subredditId,
    subredditName,
    'Echokeys leaderboard backup (score)'
  );
}

/** Wiki → Redis merge. Safe when Redis still has data (upgrade) or is empty (reinstall). */
export async function restoreLeaderboardFromWiki(
  redis: RedisLike,
  redditApi: WikiReddit,
  subredditId: string,
  subredditName: string
): Promise<{ restored: boolean; players: number }> {
  const backup = await readWikiBackup(redditApi, subredditName);
  if (!backup || !backupHasData(backup)) {
    console.log('[WikiBackup] No wiki backup found to restore');
    return { restored: false, players: 0 };
  }

  // Prefer live subreddit id; rewrite backup id if an old install used a different key.
  const normalized: LeaderboardBackupV1 = {
    ...backup,
    subredditId: subredditId || backup.subredditId,
  };

  const result = await importLeaderboardBackup(redis, normalized);
  if (result.imported) {
    console.log(
      `[WikiBackup] Restored leaderboard from wiki (${result.players} players, all-time ${normalized.alltime?.length ?? 0})`
    );
  }
  return { restored: result.imported, players: result.players };
}

/** Restore from wiki, then write a fresh backup (install/upgrade path). */
export async function syncLeaderboardWithWiki(
  redis: RedisLike,
  redditApi: WikiReddit,
  subredditId: string,
  subredditName: string
): Promise<void> {
  await restoreLeaderboardFromWiki(redis, redditApi, subredditId, subredditName);
  await backupLeaderboardToWiki(
    redis,
    redditApi,
    subredditId,
    subredditName,
    'Echokeys leaderboard sync after install/upgrade'
  );
}

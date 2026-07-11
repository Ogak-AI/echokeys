import cron from 'node-cron';
import {
  snapshotWeekly,
  snapshotMonthly,
  snapshotYearly,
} from './leaderboardService.js';

export function startScheduledJobs(): void {
  // Every Sunday at 00:00 UTC — snapshot weekly leaderboard
  cron.schedule('0 0 * * 0', () => {
    console.log('[Cron] Running weekly leaderboard snapshot...');
    try {
      snapshotWeekly();
    } catch (err) {
      console.error('[Cron] Weekly snapshot failed:', err);
    }
  }, { timezone: 'UTC' });

  // 1st of every month at 00:05 UTC — snapshot monthly leaderboard
  cron.schedule('5 0 1 * *', () => {
    const now = new Date();
    // Snapshot PREVIOUS month
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth(); // 0-indexed, so this is previous month
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    console.log(`[Cron] Running monthly leaderboard snapshot for ${year}-${month}...`);
    try {
      snapshotMonthly(year, month);
    } catch (err) {
      console.error('[Cron] Monthly snapshot failed:', err);
    }
  }, { timezone: 'UTC' });

  // January 1st at 00:10 UTC — snapshot yearly leaderboard
  cron.schedule('10 0 1 1 *', () => {
    const prevYear = new Date().getUTCFullYear() - 1;
    console.log(`[Cron] Running yearly leaderboard snapshot for ${prevYear}...`);
    try {
      snapshotYearly(prevYear);
    } catch (err) {
      console.error('[Cron] Yearly snapshot failed:', err);
    }
  }, { timezone: 'UTC' });

  console.log('[Cron] Scheduled jobs registered (weekly/monthly/yearly snapshots)');
}

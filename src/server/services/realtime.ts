import type { LeaderboardEntry, LeaderboardUpdate } from '../../shared/types/index.js';

type Realtime = {
  send(channel: string, message: unknown): Promise<void>;
};

export const LEADERBOARD_CHANNEL = 'leaderboard';

export async function broadcastWeeklyLeaderboard(
  realtime: Realtime | undefined,
  subredditId: string,
  entries: LeaderboardEntry[],
  period = 'current-week'
): Promise<void> {
  if (!realtime) return;

  const payload: LeaderboardUpdate = {
    entries,
    period,
    updatedAt: Date.now(),
  };

  await realtime.send(`leaderboard:${subredditId}`, payload);
}

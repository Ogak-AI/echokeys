import type { LeaderboardEntry, LeaderboardUpdate } from '../../shared/types/index.js';

type Realtime = {
  send(channel: string, message: unknown): Promise<void>;
};

export function leaderboardChannel(subredditId: string): string {
  return `leaderboard:${subredditId}`;
}

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

  await realtime.send(leaderboardChannel(subredditId), payload);
}

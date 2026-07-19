import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeaderboardEntry, LeaderboardUpdate } from '../../shared/types/index';

type UseLiveLeaderboardOptions = {
  enabled?: boolean;
  pollMs?: number;
  weekStart?: string;
};

export function useLiveLeaderboard({
  enabled = true,
  pollMs = 5000,
  weekStart,
}: UseLiveLeaderboardOptions = {}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const applyUpdate = useCallback((payload: LeaderboardUpdate) => {
    setEntries(payload.entries);
    setUpdatedAt(payload.updatedAt);
    setError(null);
    setLoading(false);
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const url = weekStart
        ? `/api/leaderboard/weekly/${weekStart}`
        : '/api/leaderboard/weekly';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch leaderboard');

      applyUpdate({
        entries: data.entries || [],
        period: data.period || 'current-week',
        updatedAt: data.updatedAt || Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch leaderboard';
      setError(message);
      setLoading(false);
    }
  }, [applyUpdate, weekStart]);

  useEffect(() => {
    if (!enabled) return;

    void fetchLeaderboard();

    const interval = window.setInterval(() => {
      void fetchLeaderboard();
    }, pollMs);

    return () => window.clearInterval(interval);
  }, [enabled, fetchLeaderboard, pollMs]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    void (async () => {
      try {
        const devvitWeb = await import('@devvit/web/client');
        if (!devvitWeb.connectRealtime || cancelled) return;

        const connection = await devvitWeb.connectRealtime({
          channel: 'leaderboard',
          onMessage: (message: LeaderboardUpdate) => {
            if (!cancelled) applyUpdate(message);
          },
        });

        unsubscribeRef.current = () => {
          connection?.disconnect?.();
        };
      } catch {
        // Realtime is optional — polling keeps the board live.
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [applyUpdate, enabled]);

  return {
    entries,
    loading,
    updatedAt,
    error,
    refresh: fetchLeaderboard,
  };
}

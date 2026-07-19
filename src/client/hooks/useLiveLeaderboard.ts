import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeaderboardEntry, LeaderboardUpdate } from '../../shared/types/index';
import { connectRealtime } from '../shims/devvit-web-client';

type UseLiveLeaderboardOptions = {
  subredditId?: string | null;
  enabled?: boolean;
  pollMs?: number;
  weekStart?: string;
};

export function useLiveLeaderboard({
  subredditId,
  enabled = true,
  pollMs = 8000,
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
    if (!enabled || !subredditId) return;

    let cancelled = false;

    void (async () => {
      try {
        const connection = await connectRealtime({
          channel: `leaderboard:${subredditId}`,
          onMessage: (message: LeaderboardUpdate) => {
            if (!cancelled) applyUpdate(message);
          },
        });

        if (cancelled) {
          connection?.disconnect?.();
          return;
        }

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
  }, [applyUpdate, enabled, subredditId]);

  return {
    entries,
    loading,
    updatedAt,
    error,
    refresh: fetchLeaderboard,
  };
}

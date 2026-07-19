import React, { useState, useEffect, useCallback } from 'react';
import type {
  LeaderboardEntry,
  ContentDomain,
  PlayerProfile,
  PlayerScore,
} from '../../shared/types/index';
import { ALL_DOMAINS, DOMAIN_COLORS } from '../../shared/types/index';
import { context } from '../shims/devvit-web-client';
import { useLiveLeaderboard } from '../hooks/useLiveLeaderboard';
import { weekStartWithOffset } from '../../shared/utils/time';

type Tab = 'weekly' | 'monthly' | 'yearly' | 'all-time' | 'profile';

type ProfilePayload = {
  profile: PlayerProfile;
  recentScores: PlayerScore[];
  weeklyRank: number | null;
};

function badgeStyle(badge: string): { bg: string; color: string } {
  if (badge.includes('Weekly')) return { bg: 'rgba(78,201,176,0.15)', color: '#4ec9b0' };
  if (badge.includes('Monthly')) return { bg: 'rgba(220,220,170,0.15)', color: '#dcdcaa' };
  if (badge.includes('Yearly')) return { bg: 'rgba(244,135,113,0.15)', color: '#f48771' };
  return { bg: 'rgba(0,122,204,0.15)', color: '#007acc' };
}

function limitForTab(tab: Tab): number {
  if (tab === 'all-time') return 100;
  if (tab === 'yearly') return 50;
  return 25;
}

export const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('weekly');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subredditId, setSubredditId] = useState<string | null>(null);
  const [subredditName, setSubredditName] = useState('');

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getUTCFullYear()));

  const [profileSearch, setProfileSearch] = useState(context?.username ?? '');
  const [profileData, setProfileData] = useState<ProfilePayload | null>(null);
  const [profileLoadedOnce, setProfileLoadedOnce] = useState(false);

  const liveEnabled = activeTab === 'weekly' && weekOffset === 0;
  const live = useLiveLeaderboard({
    subredditId,
    enabled: liveEnabled,
  });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) return;
        const me = await res.json();
        if (me.subredditId) setSubredditId(me.subredditId);
        if (me.subredditName) setSubredditName(me.subredditName);
        if (me.username) {
          setProfileSearch((prev) => prev || me.username);
        }
      } catch {
        // offline / local
      }
    })();
  }, []);

  useEffect(() => {
    if (liveEnabled && !live.loading) {
      setEntries(live.entries);
      setLoading(false);
      setError(live.error);
    }
  }, [liveEnabled, live.entries, live.loading, live.error]);

  const fetchLeaderboard = useCallback(async () => {
    if (activeTab === 'profile' || liveEnabled) return;

    setLoading(true);
    setError(null);
    try {
      let url = '/api/leaderboard/weekly';

      if (activeTab === 'weekly' && weekOffset !== 0) {
        url = `/api/leaderboard/weekly/${weekStartWithOffset(weekOffset)}`;
      } else if (activeTab === 'monthly') {
        url = `/api/leaderboard/monthly/${selectedMonth}`;
      } else if (activeTab === 'yearly') {
        url = `/api/leaderboard/yearly/${selectedYear}`;
      } else if (activeTab === 'all-time') {
        url = '/api/leaderboard/all-time';
      }

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch leaderboard');
      setEntries(data.entries || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching leaderboard data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, weekOffset, selectedMonth, selectedYear, liveEnabled]);

  const fetchProfile = useCallback(async (targetUsername: string) => {
    if (!targetUsername.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/profile/${encodeURIComponent(targetUsername.trim().toLowerCase())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Player profile not found');
      setProfileData(data as ProfilePayload);
      setProfileLoadedOnce(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching profile');
      setProfileData(null);
      setProfileLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'profile') {
      if (profileSearch.trim() && !profileLoadedOnce) {
        void fetchProfile(profileSearch);
      } else {
        setLoading(false);
      }
    } else if (!liveEnabled) {
      void fetchLeaderboard();
    }
  }, [
    activeTab,
    weekOffset,
    selectedMonth,
    selectedYear,
    liveEnabled,
    fetchLeaderboard,
    fetchProfile,
    profileSearch,
    profileLoadedOnce,
  ]);

  const handleBack = () => {
    window.location.href = 'splash.html';
  };

  const handleProfileSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchProfile(profileSearch);
  };

  const communityLabel = subredditName
    ? subredditName.startsWith('r/')
      ? subredditName
      : `r/${subredditName}`
    : 'this community';

  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4]">
      <header className="flex justify-between items-center px-4 py-2.5 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[#007acc] font-bold shrink-0">Echokeys Rankings</span>
          <span className="text-xs text-[#858585] font-mono truncate">{communityLabel}</span>
          {liveEnabled && live.updatedAt && (
            <span className="text-[10px] text-[#4ec9b0] shrink-0">● live</span>
          )}
        </div>
        <button onClick={handleBack} className="vsc-btn vsc-btn-ghost text-xs shrink-0">
          ← Home
        </button>
      </header>

      <div className="tab-bar overflow-x-auto">
        {(
          [
            ['weekly', 'Weekly'],
            ['monthly', 'Monthly'],
            ['yearly', 'Yearly'],
            ['all-time', 'All-Time'],
            ['profile', 'Profiles'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setActiveTab(id);
              if (id === 'weekly') setWeekOffset(0);
              if (id === 'profile') setProfileLoadedOnce(false);
            }}
            className={`tab-btn ${activeTab === id ? 'active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab !== 'profile' && activeTab !== 'all-time' && (
        <div className="flex gap-4 items-center px-4 py-2.5 bg-[#181818] border-b border-[#3c3c3c] text-xs">
          {activeTab === 'weekly' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setWeekOffset((p) => p - 1)}
                className="vsc-btn vsc-btn-ghost py-0.5 px-2"
              >
                ◀ Prev
              </button>
              <span className="font-mono text-[#4ec9b0]">
                {weekOffset === 0
                  ? 'Current week · resets Sun 00:00 UTC'
                  : `${Math.abs(weekOffset)} week(s) ago`}
              </span>
              <button
                onClick={() => setWeekOffset((p) => Math.min(0, p + 1))}
                className="vsc-btn vsc-btn-ghost py-0.5 px-2"
                disabled={weekOffset === 0}
              >
                Next ▶
              </button>
            </div>
          )}
          {activeTab === 'monthly' && (
            <div className="flex items-center gap-2">
              <span className="text-[#858585]">Month</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="vsc-input py-0.5 px-2"
                style={{ width: '150px' }}
              />
            </div>
          )}
          {activeTab === 'yearly' && (
            <div className="flex items-center gap-2">
              <span className="text-[#858585]">Year</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="vsc-select py-0.5 px-2"
                style={{ width: '100px' }}
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getUTCFullYear() - i).map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="spinner" />
            <p className="text-xs text-[#858585]">Loading stats…</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-sm text-[#f48771]">{error}</div>
        ) : activeTab === 'profile' ? (
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <form onSubmit={handleProfileSearchSubmit} className="flex gap-2">
              <input
                type="text"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Enter Reddit username…"
                className="vsc-input"
              />
              <button type="submit" className="vsc-btn">
                Search
              </button>
            </form>

            {profileData ? (
              <div className="flex flex-col gap-6">
                <div className="rounded p-5 bg-[#252526] border border-[#3c3c3c]">
                  <div className="flex justify-between items-start gap-3 mb-4">
                    <div className="min-w-0">
                      <h2 className="text-2xl font-bold text-[#4ec9b0] truncate">
                        {profileData.profile.username}
                      </h2>
                      <p className="text-xs text-[#858585]">
                        Joined {new Date(profileData.profile.joinedAt).toLocaleDateString()}
                        {profileData.weeklyRank
                          ? ` · Weekly rank #${profileData.weeklyRank}`
                          : ''}
                      </p>
                      <p className="text-sm font-mono text-[#ce9178] mt-2">
                        {(profileData.profile.totalWordsTyped || 0).toLocaleString()} words typed
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-w-[50%] justify-end">
                      {profileData.profile.badges?.map((b, i) => {
                        const { bg, color } = badgeStyle(b);
                        return (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded font-semibold font-mono border text-[9px] whitespace-nowrap"
                            style={{ background: bg, color, borderColor: color + '30' }}
                            title={b}
                          >
                            {b}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <div className="stat-box">
                      <div className="stat-val">{profileData.profile.bestWpm || 0}</div>
                      <div className="stat-lbl">Best WPM</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val">{profileData.profile.bestAccuracy || 0}%</div>
                      <div className="stat-lbl">Best Accuracy</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val stat-val-accent">
                        {(profileData.profile.totalWordsTyped || 0).toLocaleString()}
                      </div>
                      <div className="stat-lbl">Lifetime Words</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val stat-val-yellow">
                        {profileData.profile.totalChallenges || 0}
                      </div>
                      <div className="stat-lbl">Challenges</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#858585] uppercase tracking-wider mb-3">
                    Domains Practiced
                  </h3>
                  <div className="rounded p-4 bg-[#252526] border border-[#3c3c3c]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                      {ALL_DOMAINS.map((domain: ContentDomain) => {
                        const count = profileData.profile.domainCounts?.[domain] || 0;
                        return (
                          <div
                            key={domain}
                            className="flex justify-between items-center p-2 bg-[#181818] rounded border border-[#2d2d2d]"
                          >
                            <span
                              className="capitalize"
                              style={{ color: DOMAIN_COLORS[domain] || '#d4d4d4' }}
                            >
                              {domain}
                            </span>
                            <span className="font-bold text-[#4ec9b0]">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#858585] uppercase tracking-wider mb-3">
                    Recent Challenges
                  </h3>
                  <div className="editor-panel">
                    <div className="editor-titlebar">history.log</div>
                    <div className="bg-[#181818] divide-y divide-[#3c3c3c] max-h-80 overflow-y-auto">
                      {profileData.recentScores?.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#858585]">
                          No games played yet.
                        </div>
                      ) : (
                        profileData.recentScores.map((score) => (
                          <div
                            key={score.id}
                            className="p-3 text-xs flex justify-between items-center font-mono gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-[#9cdcfe] mb-0.5 truncate">
                                &quot;{score.prompt || 'Custom Prompt'}&quot;
                              </div>
                              <div className="text-[#858585] flex flex-wrap gap-2">
                                <span>WPM: {score.wpm}</span>
                                <span>Acc: {score.accuracy}%</span>
                                <span>{new Date(score.playedAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="text-[#4ec9b0] font-bold shrink-0">{score.score} pts</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-[#858585] text-xs">
                Search for a player to view stats, badges, and history.
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto editor-panel">
            <div className="editor-titlebar">
              leaderboard.csv — top {limitForTab(activeTab)} · {communityLabel}
            </div>
            <div className="overflow-x-auto bg-[#181818]">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Username</th>
                    <th>Score</th>
                    <th>Best WPM</th>
                    <th>Acc</th>
                    <th>Challenges</th>
                    <th>Lifetime Words</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-xs text-[#858585]">
                        No records found for this period. Play a challenge to appear here.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.username}>
                        <td className={`lb-rank rank-${entry.rank}`}>{entry.rank}</td>
                        <td className="font-semibold">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className="hover:underline"
                              style={{ color: '#9cdcfe' }}
                              onClick={() => {
                                setProfileSearch(entry.username);
                                setActiveTab('profile');
                                setProfileLoadedOnce(false);
                              }}
                            >
                              {entry.username}
                            </button>
                            {entry.badges?.slice(0, 2).map((badge, idx) => {
                              const { bg, color } = badgeStyle(badge);
                              return (
                                <span
                                  key={idx}
                                  className="px-1 rounded font-mono border text-[9px] whitespace-nowrap"
                                  style={{ background: bg, color, borderColor: color + '20' }}
                                  title={badge}
                                >
                                  {badge.split(' - ')[0] || badge}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="font-mono font-bold text-[#4ec9b0]">{entry.score}</td>
                        <td className="font-mono">{entry.bestWpm}</td>
                        <td className="font-mono text-[#dcdcaa]">{entry.accuracy}%</td>
                        <td className="font-mono text-[#858585]">{entry.challengesCompleted}</td>
                        <td className="font-mono text-[#ce9178]">
                          {(entry.totalWordsTyped || 0).toLocaleString()}
                        </td>
                        <td className="text-[10px] text-[#858585]">
                          {new Date(entry.lastPlayed).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

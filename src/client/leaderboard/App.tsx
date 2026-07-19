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
    : 'community';

  const openProfile = (name: string) => {
    setProfileSearch(name);
    setActiveTab('profile');
    setProfileLoadedOnce(false);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
          <span className="app-header-title">Rankings</span>
          <span className="mono muted truncate" style={{ fontSize: '0.625rem' }}>
            {communityLabel}
          </span>
          {liveEnabled && live.updatedAt && (
            <span className="chip" style={{ color: 'var(--color-vsc-green)', flexShrink: 0 }}>
              ● live
            </span>
          )}
        </div>
        <button onClick={handleBack} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">
          Home
        </button>
      </header>

      <div className="tab-bar">
        {(
          [
            ['weekly', 'Week'],
            ['monthly', 'Month'],
            ['yearly', 'Year'],
            ['all-time', 'All'],
            ['profile', 'Profile'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
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
        <div className="toolbar">
          {activeTab === 'weekly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setWeekOffset((p) => p - 1)}
                className="vsc-btn vsc-btn-ghost vsc-btn-sm"
              >
                ◀
              </button>
              <span className="mono" style={{ color: 'var(--color-vsc-green)', fontSize: '0.6875rem' }}>
                {weekOffset === 0 ? 'This week' : `${Math.abs(weekOffset)}w ago`}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((p) => Math.min(0, p + 1))}
                className="vsc-btn vsc-btn-ghost vsc-btn-sm"
                disabled={weekOffset === 0}
              >
                ▶
              </button>
            </div>
          )}
          {activeTab === 'monthly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="muted">Month</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="vsc-input"
                style={{ width: '9.5rem', minHeight: '1.65rem', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
              />
            </div>
          )}
          {activeTab === 'yearly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="muted">Year</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="vsc-select"
                style={{ width: '5.5rem', minHeight: '1.65rem', padding: '0.2rem 1.5rem 0.2rem 0.4rem', fontSize: '0.75rem' }}
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

      <div
        className="app-main"
        style={{ padding: '0.5rem', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '2rem 0' }}>
            <div className="spinner" />
            <p className="muted" style={{ fontSize: '0.6875rem' }}>Loading…</p>
          </div>
        ) : error ? (
          <div className="alert-error" style={{ textAlign: 'center', margin: '1rem auto', maxWidth: '24rem' }}>
            {error}
          </div>
        ) : activeTab === 'profile' ? (
          <div style={{ maxWidth: '36rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <form onSubmit={handleProfileSearchSubmit} style={{ display: 'flex', gap: '0.35rem' }}>
              <input
                type="text"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Reddit username…"
                className="vsc-input"
              />
              <button type="submit" className="vsc-btn" style={{ flexShrink: 0 }}>
                Search
              </button>
            </form>

            {profileData ? (
              <>
                <div className="vsc-panel" style={{ maxWidth: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.55rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <h2
                        className="truncate"
                        style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-vsc-green)' }}
                      >
                        {profileData.profile.username}
                      </h2>
                      <p className="muted" style={{ fontSize: '0.625rem' }}>
                        Joined {new Date(profileData.profile.joinedAt).toLocaleDateString()}
                        {profileData.weeklyRank ? ` · #${profileData.weeklyRank} weekly` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'flex-end', maxWidth: '48%' }}>
                      {profileData.profile.badges?.slice(0, 4).map((b, i) => {
                        const { bg, color } = badgeStyle(b);
                        return (
                          <span
                            key={i}
                            className="chip"
                            style={{ background: bg, color, borderColor: color + '40' }}
                            title={b}
                          >
                            {b.split(' - ')[0] || b}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '0.35rem',
                    }}
                    className="profile-stats"
                  >
                    <div className="stat-box">
                      <div className="stat-val">{profileData.profile.bestWpm || 0}</div>
                      <div className="stat-lbl">Best WPM</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val">{profileData.profile.bestAccuracy || 0}%</div>
                      <div className="stat-lbl">Best Acc</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val stat-val-accent">
                        {(profileData.profile.totalWordsTyped || 0).toLocaleString()}
                      </div>
                      <div className="stat-lbl">Words</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val stat-val-yellow">
                        {profileData.profile.totalChallenges || 0}
                      </div>
                      <div className="stat-lbl">Races</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="muted" style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                    Domains
                  </h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(6.5rem, 1fr))',
                      gap: '0.3rem',
                    }}
                  >
                    {ALL_DOMAINS.map((domain: ContentDomain) => {
                      const count = profileData.profile.domainCounts?.[domain] || 0;
                      return (
                        <div
                          key={domain}
                          className="mono"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.3rem 0.4rem',
                            fontSize: '0.6875rem',
                            background: 'var(--color-vsc-sidebar)',
                            border: '1px solid var(--color-vsc-border)',
                            borderRadius: 2,
                          }}
                        >
                          <span style={{ color: DOMAIN_COLORS[domain] || '#d4d4d4', textTransform: 'capitalize' }}>
                            {domain}
                          </span>
                          <span style={{ fontWeight: 700, color: 'var(--color-vsc-green)' }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="muted" style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                    Recent
                  </h3>
                  <div className="editor-panel">
                    <div className="editor-titlebar">history.log</div>
                    <div style={{ background: 'var(--color-vsc-bg-darker)', maxHeight: '14rem', overflowY: 'auto' }}>
                      {profileData.recentScores?.length === 0 ? (
                        <div className="muted" style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.6875rem' }}>
                          No games yet.
                        </div>
                      ) : (
                        profileData.recentScores.map((score) => (
                          <div
                            key={score.id}
                            className="mono"
                            style={{
                              padding: '0.4rem 0.55rem',
                              fontSize: '0.6875rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '0.5rem',
                              borderBottom: '1px solid var(--color-vsc-border)',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div className="truncate" style={{ color: 'var(--color-vsc-cyan)', marginBottom: '0.1rem' }}>
                                &quot;{score.prompt || 'Prompt'}&quot;
                              </div>
                              <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', fontSize: '0.625rem' }}>
                                <span>{score.wpm} wpm</span>
                                <span>{score.accuracy}%</span>
                                <span>{new Date(score.playedAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div style={{ color: 'var(--color-vsc-green)', fontWeight: 700, flexShrink: 0 }}>
                              {score.score}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted" style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '0.75rem' }}>
                Search a player for stats &amp; badges.
              </p>
            )}
          </div>
        ) : (
          <div className="editor-panel" style={{ maxWidth: '56rem', margin: '0 auto' }}>
            <div className="editor-titlebar">
              leaderboard.csv — top {limitForTab(activeTab)} · {communityLabel}
            </div>

            {/* Mobile cards */}
            <div className="lb-cards">
              {entries.length === 0 ? (
                <p className="muted" style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem' }}>
                  No records yet. Play a challenge to appear here.
                </p>
              ) : (
                entries.map((entry) => (
                  <div key={entry.username} className="lb-card">
                    <span className={`lb-rank rank-${entry.rank}`}>{entry.rank}</span>
                    <button
                      type="button"
                      onClick={() => openProfile(entry.username)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-vsc-cyan)',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                        padding: 0,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.username}
                    </button>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--color-vsc-green)' }}>
                      {entry.score}
                    </span>
                    <div className="lb-card-meta">
                      <span>{entry.bestWpm} wpm</span>
                      <span>{entry.accuracy}% acc</span>
                      <span>{entry.challengesCompleted} races</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Table for wider screens */}
            <div className="lb-table-wrap" style={{ overflowX: 'auto', background: 'var(--color-vsc-bg-darker)' }}>
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>User</th>
                    <th>Score</th>
                    <th>WPM</th>
                    <th className="lb-col-acc">Acc</th>
                    <th className="lb-col-challenges">Races</th>
                    <th className="lb-col-words">Words</th>
                    <th className="lb-col-active">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '1.25rem', fontSize: '0.75rem' }}>
                        No records yet. Play a challenge to appear here.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.username}>
                        <td className={`lb-rank rank-${entry.rank}`}>{entry.rank}</td>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => openProfile(entry.username)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-vsc-cyan)',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              {entry.username}
                            </button>
                            {entry.badges?.slice(0, 1).map((badge, idx) => {
                              const { bg, color } = badgeStyle(badge);
                              return (
                                <span
                                  key={idx}
                                  className="chip"
                                  style={{ background: bg, color, borderColor: color + '30' }}
                                  title={badge}
                                >
                                  {badge.split(' - ')[0] || badge}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="mono" style={{ fontWeight: 700, color: 'var(--color-vsc-green)' }}>
                          {entry.score}
                        </td>
                        <td className="mono">{entry.bestWpm}</td>
                        <td className="mono lb-col-acc" style={{ color: 'var(--color-vsc-yellow)' }}>
                          {entry.accuracy}%
                        </td>
                        <td className="mono muted lb-col-challenges">{entry.challengesCompleted}</td>
                        <td className="mono lb-col-words" style={{ color: 'var(--color-vsc-orange)' }}>
                          {(entry.totalWordsTyped || 0).toLocaleString()}
                        </td>
                        <td className="muted lb-col-active" style={{ fontSize: '0.625rem' }}>
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

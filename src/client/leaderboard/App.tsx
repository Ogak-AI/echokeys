import React, { useState, useEffect, useCallback } from 'react';
import type {
  LeaderboardEntry,
  ContentDomain,
  PlayerProfile,
  PlayerScore,
  Tournament,
} from '../../shared/types/index';
import { ALL_DOMAINS, DOMAIN_COLORS } from '../../shared/types/index';
import { context } from '../shims/devvit-web-client';
import { useLiveLeaderboard } from '../hooks/useLiveLeaderboard';
import { weekStartWithOffset } from '../../shared/utils/time';

type Tab = 'tournament' | 'weekly' | 'monthly' | 'yearly' | 'all-time' | 'profile';

type ProfilePayload = {
  profile: PlayerProfile;
  recentScores: PlayerScore[];
  weeklyRank: number | null;
};

function badgeStyle(badge: string): { bg: string; color: string } {
  if (badge.includes('Weekly'))  return { bg: 'rgba(61,255,160,0.12)',  color: '#3dffa0' };
  if (badge.includes('Monthly')) return { bg: 'rgba(232,255,60,0.12)',  color: '#e8ff3c' };
  if (badge.includes('Yearly'))  return { bg: 'rgba(255,159,74,0.12)',  color: '#ff9f4a' };
  return { bg: 'rgba(77,166,255,0.12)', color: '#4da6ff' };
}

function limitForTab(tab: Tab): number {
  if (tab === 'all-time') return 100;
  if (tab === 'yearly')   return 50;
  return 25;
}

export const App = () => {
  const [activeTab, setActiveTab]       = useState<Tab>('weekly');
  const [entries, setEntries]           = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [subredditId, setSubredditId]   = useState<string | null>(null);
  const [subredditName, setSubredditName] = useState('');
  const [tournament, setTournament]     = useState<Tournament | null>(null);
  const [hasTournament, setHasTournament] = useState(false);
  const [weekOffset, setWeekOffset]     = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getUTCFullYear()));
  const [profileSearch, setProfileSearch] = useState(context?.username ?? '');
  const [profileData, setProfileData]   = useState<ProfilePayload | null>(null);
  const [profileLoadedOnce, setProfileLoadedOnce] = useState(false);

  const liveEnabled = activeTab === 'weekly' && weekOffset === 0 && !hasTournament;
  const live = useLiveLeaderboard({ subredditId, enabled: liveEnabled });

  const viewerUsername = (context?.username ?? '').toLowerCase();

  useEffect(() => {
    void (async () => {
      try {
        const [meRes, tRes] = await Promise.all([fetch('/api/me'), fetch('/api/post/tournament')]);
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.subredditId)  setSubredditId(me.subredditId);
          if (me.subredditName) setSubredditName(me.subredditName);
          if (me.username)     setProfileSearch(prev => prev || me.username);
        }
        if (tRes.ok) {
          const tData = await tRes.json();
          if (tData.tournament) {
            setTournament(tData.tournament as Tournament);
            setHasTournament(true);
            setActiveTab('tournament');
            setEntries((tData.standings as LeaderboardEntry[]) || []);
            setLoading(false);
          }
        }
      } catch { /* offline */ }
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
    setLoading(true); setError(null);
    try {
      let url = '/api/leaderboard/weekly';
      if      (activeTab === 'tournament' && tournament?.id) url = `/api/tournament/${encodeURIComponent(tournament.id)}`;
      else if (activeTab === 'weekly' && weekOffset !== 0)   url = `/api/leaderboard/weekly/${weekStartWithOffset(weekOffset)}`;
      else if (activeTab === 'monthly')  url = `/api/leaderboard/monthly/${selectedMonth}`;
      else if (activeTab === 'yearly')   url = `/api/leaderboard/yearly/${selectedYear}`;
      else if (activeTab === 'all-time') url = '/api/leaderboard/all-time';

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch leaderboard');
      if (activeTab === 'tournament') {
        setEntries(data.standings || []);
        if (data.tournament) setTournament(data.tournament as Tournament);
      } else {
        setEntries(data.entries || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading leaderboard');
    } finally { setLoading(false); }
  }, [activeTab, weekOffset, selectedMonth, selectedYear, liveEnabled, tournament?.id]);

  const fetchProfile = useCallback(async (u: string) => {
    if (!u.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(u.trim().toLowerCase())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Player not found');
      setProfileData(data as ProfilePayload);
      setProfileLoadedOnce(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching profile');
      setProfileData(null);
      setProfileLoadedOnce(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'profile') {
      if (profileSearch.trim() && !profileLoadedOnce) void fetchProfile(profileSearch);
      else setLoading(false);
    } else if (!liveEnabled) {
      void fetchLeaderboard();
    }
  }, [activeTab, weekOffset, selectedMonth, selectedYear, liveEnabled, fetchLeaderboard, fetchProfile, profileSearch, profileLoadedOnce]);

  const communityLabel = subredditName
    ? subredditName.startsWith('r/') ? subredditName : `r/${subredditName}`
    : 'community';

  const openProfile = (name: string) => {
    setProfileSearch(name);
    setActiveTab('profile');
    setProfileLoadedOnce(false);
  };

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
          <span className="app-header-title">
            {activeTab === 'tournament' ? 'Tournament' : 'Rankings'}
          </span>
          <span className="mono muted truncate" style={{ fontSize: '0.625rem' }}>{communityLabel}</span>
          {liveEnabled && live.updatedAt && (
            <span className="chip" style={{ color: 'var(--color-green)', borderColor: 'rgba(61,255,160,0.2)' }}>live</span>
          )}
        </div>
        <button onClick={() => { window.location.href = 'splash.html'; }} className="vsc-btn vsc-btn-ghost vsc-btn-sm" type="button">
          Home
        </button>
      </header>

      {/* ── Tabs ── */}
      <div className="tab-bar">
        {([
          ...(hasTournament ? [['tournament', 'Cup']] : []),
          ['weekly',   'Week'],
          ['monthly',  'Month'],
          ['yearly',   'Year'],
          ['all-time', 'All'],
          ['profile',  'Profile'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id} type="button"
            className={`tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(id);
              if (id === 'weekly')  setWeekOffset(0);
              if (id === 'profile') setProfileLoadedOnce(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Toolbar (time-period controls) ── */}
      {activeTab === 'tournament' && tournament && (
        <div className="toolbar">
          <span className="mono" style={{ color: 'var(--color-blue)', fontSize: '0.6875rem' }}>
            {tournament.name} · {tournament.participants.length}/{tournament.maxPlayers} · {tournament.status}
          </span>
        </div>
      )}
      {activeTab === 'weekly' && (
        <div className="toolbar">
          <button type="button" className="vsc-btn vsc-btn-ghost vsc-btn-sm" onClick={() => setWeekOffset(p => p - 1)}>← Prev</button>
          <span className="mono" style={{ color: 'var(--color-accent)', fontSize: '0.6875rem' }}>
            {weekOffset === 0 ? 'This week' : `${Math.abs(weekOffset)}w ago`}
          </span>
          <button type="button" className="vsc-btn vsc-btn-ghost vsc-btn-sm" disabled={weekOffset === 0} onClick={() => setWeekOffset(p => Math.min(0, p + 1))}>Next →</button>
        </div>
      )}
      {activeTab === 'monthly' && (
        <div className="toolbar">
          <span className="muted" style={{ fontSize: '0.75rem' }}>Month</span>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="vsc-input" style={{ width: '9rem', height: '1.75rem', padding: '0 0.4rem', fontSize: '0.75rem' }} />
        </div>
      )}
      {activeTab === 'yearly' && (
        <div className="toolbar">
          <span className="muted" style={{ fontSize: '0.75rem' }}>Year</span>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="vsc-select" style={{ width: '5.5rem', height: '1.75rem', padding: '0 1.5rem 0 0.4rem', fontSize: '0.75rem' }}>
            {Array.from({ length: 5 }, (_, i) => new Date().getUTCFullYear() - i).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Body ── */}
      <div className="app-main">
        {loading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.65rem', padding: '2rem' }}>
            <div className="spinner" />
            <p className="muted" style={{ fontSize: '0.75rem' }}>Loading…</p>
          </div>
        ) : error ? (
          <div style={{ padding: '1.25rem' }}>
            <div className="alert-error">{error}</div>
          </div>
        ) : activeTab === 'profile' ? (
          <ProfileView
            profileSearch={profileSearch}
            setProfileSearch={setProfileSearch}
            profileData={profileData}
            onSearch={u => { setProfileLoadedOnce(false); void fetchProfile(u); }}
            loading={loading}
          />
        ) : (
          <LeaderboardView
            entries={entries}
            tab={activeTab}
            viewerUsername={viewerUsername}
            onOpenProfile={openProfile}
          />
        )}
      </div>
    </div>
  );
};

/* ── Sub-components ─────────────────────────────────────────── */

function LeaderboardView({ entries, tab, viewerUsername, onOpenProfile }: {
  entries: LeaderboardEntry[];
  tab: Tab;
  viewerUsername: string;
  onOpenProfile: (u: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="lb-empty">
        <div className="lb-empty-icon">⌨</div>
        <span>No records yet.</span>
        <span className="muted" style={{ fontSize: '0.6875rem' }}>Play a race to appear here.</span>
      </div>
    );
  }

  return (
    <>
      {/* Header row */}
      <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-dim)' }}>
          Top {limitForTab(tab)} · most correct words, then lowest time
        </span>
      </div>

      {/* Rows */}
      {entries.map(entry => {
        const isMe = entry.username === viewerUsername;
        const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : '';
        return (
          <div key={entry.username} className={`lb-row${isMe ? ' is-me' : ''}`}>
            <span className={`lb-row-rank ${rankClass}`}>{entry.rank}</span>
            <div className="lb-row-user">
              <button type="button" className="lb-row-name" onClick={() => onOpenProfile(entry.username)}>
                {entry.username}
                {entry.badges?.slice(0, 1).map((b, i) => {
                  const { bg, color } = badgeStyle(b);
                  return <span key={i} className="chip" style={{ background: bg, color, borderColor: 'transparent', marginLeft: '0.35rem', verticalAlign: 'middle' }} title={b}>{b.split(' - ')[0]}</span>;
                })}
              </button>
              <div className="lb-row-meta">
                <span>{entry.bestWpm} wpm</span>
                <span>{entry.accuracy}% acc</span>
                <span>{entry.challengesCompleted} races</span>
              </div>
            </div>
            <div className="lb-row-score">
              <div className="lb-row-score-val">{(entry.bestCorrectWords ?? 0).toLocaleString()}<span style={{ fontSize: '0.6875rem', fontWeight: 400, color: 'var(--color-muted)', marginLeft: '0.2rem' }}>w</span></div>
              <div className="lb-row-score-time">{entry.bestTimeSeconds > 0 ? `${entry.bestTimeSeconds}s` : '—'}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ProfileView({ profileSearch, setProfileSearch, profileData, onSearch, loading }: {
  profileSearch: string;
  setProfileSearch: (v: string) => void;
  profileData: ProfilePayload | null;
  onSearch: (u: string) => void;
  loading: boolean;
}) {
  const p = profileData?.profile;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Search bar */}
      <div style={{ padding: '0.65rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <input
          type="text"
          value={profileSearch}
          onChange={e => setProfileSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSearch(profileSearch); }}
          placeholder="Reddit username…"
          className="vsc-input"
        />
        <button type="button" className="vsc-btn" style={{ flexShrink: 0 }} onClick={() => onSearch(profileSearch)}>
          Search
        </button>
      </div>

      {!p ? (
        <div className="lb-empty">
          <div className="lb-empty-icon">👤</div>
          <span>Search a player</span>
          <span className="muted" style={{ fontSize: '0.6875rem' }}>Stats, WPM, and badges</span>
        </div>
      ) : (
        <>
          {/* Profile hero */}
          <div className="profile-hero">
            <div>
              <div className="profile-name">{p.username}</div>
              <div className="profile-joined">
                Joined {new Date(p.joinedAt).toLocaleDateString()}
                {profileData.weeklyRank ? ` · #${profileData.weeklyRank} this week` : ''}
              </div>
            </div>
            <div className="profile-badges">
              {p.badges?.slice(0, 4).map((b, i) => {
                const { bg, color } = badgeStyle(b);
                return <span key={i} className="chip" style={{ background: bg, color, borderColor: 'transparent' }} title={b}>{b.split(' - ')[0]}</span>;
              })}
            </div>
          </div>

          {/* Stats grid */}
          <div className="profile-stats-grid">
            <div className="profile-stat">
              <div className="profile-stat-val" style={{ color: 'var(--color-accent)' }}>{(p.bestCorrectWords || 0).toLocaleString()}</div>
              <div className="profile-stat-lbl">Best run</div>
            </div>
            <div className="profile-stat">
              <div className="profile-stat-val" style={{ color: 'var(--color-green)' }}>{p.bestTimeSeconds ? `${p.bestTimeSeconds}s` : '—'}</div>
              <div className="profile-stat-lbl">Best time</div>
            </div>
            <div className="profile-stat">
              <div className="profile-stat-val" style={{ color: 'var(--color-blue)' }}>{p.bestWpm}</div>
              <div className="profile-stat-lbl">Best WPM</div>
            </div>
            <div className="profile-stat">
              <div className="profile-stat-val" style={{ color: 'var(--color-gold)' }}>{p.totalChallenges}</div>
              <div className="profile-stat-lbl">Races</div>
            </div>
          </div>

          {/* Domains */}
          <div style={{ padding: '0.6rem 1.25rem 0.35rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-dim)', marginBottom: '0.4rem' }}>Domains</div>
            <div className="domain-grid">
              {ALL_DOMAINS.map((domain: ContentDomain) => (
                <div key={domain} className="domain-cell">
                  <span style={{ color: DOMAIN_COLORS[domain] ?? '#d4d4d4', textTransform: 'capitalize' }}>{domain}</span>
                  <span className="domain-count">{p.domainCounts?.[domain] || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent scores */}
          <div style={{ padding: '0.5rem 1.25rem 0.35rem', flexShrink: 0 }}>
            <div style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-dim)', marginBottom: '0.35rem' }}>Recent races</div>
          </div>
          {profileData.recentScores?.length === 0 ? (
            <div style={{ padding: '0.75rem 1.25rem', color: 'var(--color-muted)', fontSize: '0.75rem' }}>No races yet.</div>
          ) : (
            profileData.recentScores.map(s => (
              <div key={s.id} className="score-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="score-row-prompt">"{(s.prompt || 'Race').slice(0, 60)}{(s.prompt?.length ?? 0) > 60 ? '…' : ''}"</div>
                  <div className="score-row-meta">
                    <span>{s.timeSeconds}s</span>
                    <span>{s.wpm} wpm</span>
                    <span>{s.accuracy}%</span>
                    <span>{new Date(s.playedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="score-row-words">{(s.correctWords ?? 0).toLocaleString()}w</div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

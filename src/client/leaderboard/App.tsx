import React, { useState, useEffect } from 'react';
import type { LeaderboardEntry, ContentDomain } from '../../shared/types/index';
import { DOMAIN_COLORS } from '../../shared/types/index';
import { context } from '../shims/devvit-web-client';

type Tab = 'weekly' | 'monthly' | 'yearly' | 'all-time' | 'profile';

export const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('weekly');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search parameters for historical lookups
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getUTCFullYear()));

  // Profile data
  const [profileSearch, setProfileSearch] = useState(context?.username ?? '');
  const [profileData, setProfileData] = useState<any>(null);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/leaderboard/weekly';

      if (activeTab === 'weekly' && weekOffset !== 0) {
        // Calculate historical week start
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - (d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1) + (weekOffset * 7));
        const weekStartStr = d.toISOString().split('T')[0]!;
        url = `/api/leaderboard/weekly/${weekStartStr}`;
      } else if (activeTab === 'monthly') {
        url = `/api/leaderboard/monthly/${selectedMonth}`;
      } else if (activeTab === 'yearly') {
        url = `/api/leaderboard/yearly/${selectedYear}`;
      } else if (activeTab === 'all-time') {
        url = '/api/leaderboard/all-time';
      }

      if (activeTab !== 'profile') {
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch leaderboard');
        setEntries(data.entries || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching leaderboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async (targetUsername: string) => {
    if (!targetUsername.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/profile/${targetUsername.trim().toLowerCase()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Player profile not found');
      setProfileData(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching profile');
      setProfileData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'profile') {
      fetchProfile(profileSearch);
    } else {
      fetchLeaderboard();
    }
  }, [activeTab, weekOffset, selectedMonth, selectedYear]);

  const handleBack = () => {
    window.location.href = 'splash.html';
  };

  const handleProfileSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProfile(profileSearch);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4]">
      {/* Header bar */}
      <div className="flex justify-between items-center px-6 py-3 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-3">
          <span className="text-[#007acc] font-bold">Echokeys Rankings</span>
        </div>
        <button onClick={handleBack} className="vsc-btn vsc-btn-ghost text-xs">
          ← Back to Home
        </button>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button onClick={() => { setActiveTab('weekly'); setWeekOffset(0); }} className={`tab-btn ${activeTab === 'weekly' ? 'active' : ''}`}>
          Weekly
        </button>
        <button onClick={() => setActiveTab('monthly')} className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}>
          Monthly
        </button>
        <button onClick={() => setActiveTab('yearly')} className={`tab-btn ${activeTab === 'yearly' ? 'active' : ''}`}>
          Yearly
        </button>
        <button onClick={() => setActiveTab('all-time')} className={`tab-btn ${activeTab === 'all-time' ? 'active' : ''}`}>
          All-Time
        </button>
        <button onClick={() => setActiveTab('profile')} className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}>
          Profiles
        </button>
      </div>

      {/* Tab controls (Filters) */}
      {activeTab !== 'profile' && activeTab !== 'all-time' && (
        <div className="flex gap-4 items-center px-6 py-3 bg-[#181818] border-b border-[#3c3c3c] text-xs">
          {activeTab === 'weekly' && (
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekOffset(p => p - 1)} className="vsc-btn vsc-btn-ghost py-0.5 px-2">◀ Prev Week</button>
              <span className="font-mono text-[#4ec9b0]">
                {weekOffset === 0 ? 'Current Week' : `${Math.abs(weekOffset)} week(s) ago`}
              </span>
              <button onClick={() => setWeekOffset(p => Math.min(0, p + 1))} className="vsc-btn vsc-btn-ghost py-0.5 px-2" disabled={weekOffset === 0}>Next Week ▶</button>
            </div>
          )}
          {activeTab === 'monthly' && (
            <div className="flex items-center gap-2">
              <span className="text-[#858585]">Choose Month:</span>
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
              <span className="text-[#858585]">Choose Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="vsc-select py-0.5 px-2"
                style={{ width: '100px' }}
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Main Table / Profile View */}
      <div className="flex-1 p-6 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="spinner"></div>
            <p className="text-xs text-[#858585]">Loading stats...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-sm text-[#f48771]">{error}</div>
        ) : activeTab === 'profile' ? (
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            {/* Profile search form */}
            <form onSubmit={handleProfileSearchSubmit} className="flex gap-2">
              <input
                type="text"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Enter Reddit username..."
                className="vsc-input"
              />
              <button type="submit" className="vsc-btn">Search</button>
            </form>

            {profileData ? (
              <div className="flex flex-col gap-6">
                {/* Stats panel */}
                <div className="rounded p-6 bg-[#252526] border border-[#3c3c3c]">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-[#4ec9b0]">{profileData.profile?.username}</h2>
                      <p className="text-xs text-[#858585]">Joined Echokeys: {new Date(profileData.profile?.joinedAt).toLocaleDateString()}</p>
                    </div>
                    {/* Badges */}
                    <div className="flex flex-wrap gap-1.5 max-w-[50%] justify-end">
                      {profileData.profile?.badges?.map((b: string, i: number) => {
                        let bg = 'rgba(0,122,204,0.15)';
                        let color = '#007acc';
                        if (b.includes('Weekly')) {
                          bg = 'rgba(78,201,176,0.15)';
                          color = '#4ec9b0';
                        } else if (b.includes('Monthly')) {
                          bg = 'rgba(220,220,170,0.15)';
                          color = '#dcdcaa';
                        } else if (b.includes('Yearly')) {
                          bg = 'rgba(244,135,113,0.15)';
                          color = '#f48771';
                        }
                        return (
                          <span
                            key={i}
                            className="text-4xs px-2 py-0.5 rounded font-semibold font-mono border text-[9px] whitespace-nowrap"
                            style={{ background: bg, color, borderColor: color + '30' }}
                            title={b}
                          >
                            {b}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <div className="stat-box">
                      <div className="stat-val">{profileData.profile?.bestWpm || 0}</div>
                      <div className="stat-lbl">Best WPM</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val">{profileData.profile?.bestAccuracy || 0}%</div>
                      <div className="stat-lbl">Best Accuracy</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val stat-val-accent">{profileData.profile?.totalWordsTyped || 0}</div>
                      <div className="stat-lbl">Words Typed</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val stat-val-yellow">{profileData.profile?.totalChallenges || 0}</div>
                      <div className="stat-lbl">Total Games</div>
                    </div>
                  </div>
                </div>

                {/* Domains Practice Statistics */}
                <div>
                  <h3 className="text-sm font-bold text-[#858585] uppercase tracking-wider mb-3">Domain Practice Distribution</h3>
                  <div className="rounded p-4 bg-[#252526] border border-[#3c3c3c]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                      {(['code', 'prose', 'legal', 'marketing', 'technical', 'creative'] as ContentDomain[]).map((domain) => {
                        const count = profileData.profile?.domainCounts?.[domain] || 0;
                        return (
                          <div key={domain} className="flex justify-between items-center p-2 bg-[#181818] rounded border border-[#2d2d2d]">
                            <span className="capitalize" style={{ color: DOMAIN_COLORS[domain] || '#d4d4d4' }}>
                              {domain}
                            </span>
                            <span className="font-bold text-[#4ec9b0]">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Challenge History */}
                <div>
                  <h3 className="text-sm font-bold text-[#858585] uppercase tracking-wider mb-3">Recent Challenges</h3>
                  <div className="editor-panel">
                    <div className="editor-titlebar">history.log</div>
                    <div className="bg-[#181818] divide-y divide-[#3c3c3c] max-h-80 overflow-y-auto">
                      {profileData.recentScores?.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#858585]">No games played yet!</div>
                      ) : (
                        profileData.recentScores.map((score: any) => (
                          <div key={score.id} className="p-3 text-xs flex justify-between items-center font-mono">
                            <div>
                              <div className="text-[#9cdcfe] mb-0.5">"{score.prompt || 'Custom Prompt'}"</div>
                              <div className="text-[#858585] flex gap-2">
                                <span>WPM: {score.wpm}</span>
                                <span>Acc: {score.accuracy}%</span>
                                <span>{new Date(score.playedAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="text-[#4ec9b0] font-bold">
                              {score.score} pts
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-[#858585] text-xs">Search for a player to view stats, badges, and history.</div>
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto editor-panel">
            <div className="editor-titlebar">leaderboard.csv</div>
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
                        No records found for this period.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.username}>
                        <td className={`lb-rank rank-${entry.rank}`}>{entry.rank}</td>
                        <td className="font-semibold flex items-center gap-2">
                          <span style={{ color: '#9cdcfe' }}>{entry.username}</span>
                          <span className="flex flex-wrap gap-1">
                            {entry.badges?.map((badge, idx) => {
                              let bg = 'rgba(0,122,204,0.15)';
                              let color = '#007acc';
                              if (badge.includes('Weekly')) {
                                bg = 'rgba(78,201,176,0.15)';
                                color = '#4ec9b0';
                              } else if (badge.includes('Monthly')) {
                                bg = 'rgba(220,220,170,0.15)';
                                color = '#dcdcaa';
                              } else if (badge.includes('Yearly')) {
                                bg = 'rgba(244,135,113,0.15)';
                                color = '#f48771';
                              }
                              return (
                                <span
                                  key={idx}
                                  className="text-4xs px-1 py-0.2 rounded font-mono border text-[9px] whitespace-nowrap"
                                  style={{ background: bg, color, borderColor: color + '20' }}
                                  title={badge}
                                >
                                  {badge.split(' - ')[0] || badge}
                                </span>
                              );
                            })}
                          </span>
                        </td>
                        <td className="font-mono font-bold text-[#4ec9b0]">{entry.score}</td>
                        <td className="font-mono">{entry.bestWpm} WPM</td>
                        <td className="font-mono text-[#dcdcaa]">{entry.accuracy}%</td>
                        <td className="font-mono text-[#858585]">{entry.challengesCompleted}</td>
                        <td className="font-mono text-[#ce9178]">{entry.totalWordsTyped || 0}</td>
                        <td className="text-2xs text-[#858585]">
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

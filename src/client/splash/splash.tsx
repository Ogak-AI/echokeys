import '../index.css';
import { context, navigateTo, requestExpandedMode } from '../shims/devvit-web-client';
import { StrictMode, useRef, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { LeaderboardEntry, Tournament, TournamentSummary } from '../../shared/types/index';

type PostMeta = { mode?: string; challengeId?: string; tournamentId?: string; prompt?: string; domain?: string };

function formatEndsAt(endsAt: number): string {
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d left`;
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
}

const Splash = () => {
  const [username, setUsername]             = useState(context?.username ?? 'Typist');
  const [wordsTyped, setWordsTyped]         = useState<number | null>(null);
  const [subredditName, setSubredditName]   = useState('');
  const [postMeta, setPostMeta]             = useState<PostMeta | null>(null);
  const [bestCorrectWords, setBestCorrectWords] = useState<number | null>(null);
  const [bestTimeSeconds, setBestTimeSeconds]   = useState<number | null>(null);
  const [tournament, setTournament]         = useState<Tournament | null>(null);
  const [standings, setStandings]           = useState<LeaderboardEntry[]>([]);
  const [joined, setJoined]                 = useState(false);
  const [openTournaments, setOpenTournaments] = useState<TournamentSummary[]>([]);
  const [busy, setBusy]                     = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);
  const [createName, setCreateName]         = useState('');
  const [isModerator, setIsModerator]       = useState(false);

  const playBtnRef = useRef<HTMLButtonElement>(null);
  const lbBtnRef   = useRef<HTMLButtonElement>(null);

  const isTournamentPost = Boolean(postMeta?.mode === 'tournament' || postMeta?.tournamentId || tournament);

  const refreshMe = useCallback(async () => {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const me = await res.json();
    if (me.username) setUsername(me.username);
    if (me.subredditName) setSubredditName(me.subredditName);
    setIsModerator(Boolean(me.isModerator));
    if (me.profile?.totalWordsTyped != null)  setWordsTyped(me.profile.totalWordsTyped as number);
    if (me.profile?.bestCorrectWords != null) setBestCorrectWords(me.profile.bestCorrectWords as number);
    if (me.profile?.bestTimeSeconds != null)  setBestTimeSeconds(me.profile.bestTimeSeconds as number);
    if (me.postData && typeof me.postData === 'object') setPostMeta(me.postData as PostMeta);
  }, []);

  const loadTournamentContext = useCallback(async () => {
    const [postRes, listRes] = await Promise.all([fetch('/api/post/tournament'), fetch('/api/tournaments')]);
    if (postRes.ok) {
      const data = await postRes.json();
      if (data.tournament) { setTournament(data.tournament as Tournament); setStandings((data.standings as LeaderboardEntry[]) || []); setJoined(Boolean(data.joined)); }
    }
    if (listRes.ok) {
      const data = await listRes.json();
      setOpenTournaments(((data.tournaments as TournamentSummary[]) || []).filter(t => t.status === 'open').slice(0, 5));
    }
  }, []);

  useEffect(() => {
    void (async () => { try { await refreshMe(); await loadTournamentContext(); } catch { /* offline */ } })();
  }, [refreshMe, loadTournamentContext]);

  useEffect(() => {
    const playBtn = playBtnRef.current;
    const lbBtn   = lbBtnRef.current;
    const onPlay  = (e: MouseEvent) => requestExpandedMode(e, 'game').catch(() => window.location.assign('game.html'));
    const onLb    = (e: MouseEvent) => requestExpandedMode(e, 'leaderboard').catch(() => window.location.assign('leaderboard.html'));
    playBtn?.addEventListener('click', onPlay);
    lbBtn?.addEventListener('click', onLb);
    return () => { playBtn?.removeEventListener('click', onPlay); lbBtn?.removeEventListener('click', onLb); };
  }, [isTournamentPost, joined, tournament?.status]);

  const onJoin = async () => {
    if (!tournament?.id) return;
    setBusy(true); setActionError(null);
    try {
      const res = await fetch(`/api/tournament/${encodeURIComponent(tournament.id)}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      setTournament(data.tournament as Tournament); setStandings((data.standings as LeaderboardEntry[]) || []); setJoined(true);
    } catch (err: unknown) { setActionError(err instanceof Error ? err.message : 'Failed to join'); }
    finally { setBusy(false); }
  };

  const onCreateTournament = async () => {
    setBusy(true); setActionError(null);
    try {
      const res = await fetch('/api/tournament/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: createName.trim() || undefined, durationHours: 24 }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create tournament');
      const url = data.postUrl as string | undefined;
      if (url) { await navigateTo(url); } else { setActionError('Tournament created — find it in the feed.'); await loadTournamentContext(); }
    } catch (err: unknown) { setActionError(err instanceof Error ? err.message : 'Failed to create tournament'); }
    finally { setBusy(false); }
  };

  const communityLabel = subredditName ? (subredditName.startsWith('r/') ? subredditName : `r/${subredditName}`) : '';
  const hasPostChallenge  = Boolean(postMeta?.challengeId) && !isTournamentPost;
  const showStats         = (wordsTyped != null && wordsTyped > 0) || (bestCorrectWords != null && bestCorrectWords > 0);
  const tournamentOpen    = tournament?.status === 'open' && (tournament.endsAt ?? 0) > Date.now();
  const canPlayTournament = isTournamentPost && joined && tournamentOpen;

  return (
    <div className="app-shell">

      {/* ── Identity header ── */}
      <div className="splash-header">
        <div className="splash-wordmark">echo<em>keys</em></div>
        <div className="splash-tagline">
          {isTournamentPost
            ? 'Community tournament — same excerpt for everyone.'
            : 'Race 2,000+ words. Rank by correct words, then time.'}
        </div>
        {communityLabel && <div className="splash-community">{communityLabel}</div>}
      </div>

      {/* ── User row ── */}
      <div className="splash-user-row">
        <div>
          <div className="splash-username">
            u/{username}
          </div>
        </div>
        {showStats && !isTournamentPost && (
          <div style={{ display: 'flex', gap: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--color-muted)', textAlign: 'right' }}>
            {bestCorrectWords != null && bestCorrectWords > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>{bestCorrectWords.toLocaleString()}</div>
                <div style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-dim)' }}>Best run{bestTimeSeconds ? ` · ${bestTimeSeconds}s` : ''}</div>
              </div>
            )}
            {wordsTyped != null && wordsTyped > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{wordsTyped.toLocaleString()}</div>
                <div style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-dim)' }}>Words typed</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="splash-body">

        {/* Tournament card */}
        {isTournamentPost && tournament && (
          <div className="splash-section">
            <div className="splash-section-label">Tournament</div>
            <div className="tournament-card">
              <div className="tournament-card-title">{tournament.name}</div>
              <div className="tournament-card-meta">
                {tournament.participants.length}/{tournament.maxPlayers} joined · {formatEndsAt(tournament.endsAt)} · {tournament.status}
              </div>
              {standings.length > 0 && (
                <div style={{ marginTop: '0.4rem' }}>
                  {standings.slice(0, 5).map((row) => (
                    <div key={row.username} className={`standing-row${row.username === username.toLowerCase() ? ' is-me' : ''}`}>
                      <span>#{row.rank} {row.username}</span>
                      <span>{row.bestCorrectWords}w · {row.bestTimeSeconds}s</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Challenge context */}
        {hasPostChallenge && postMeta?.prompt && (
          <div className="splash-section">
            <div className="splash-section-label">This challenge</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-blue)', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {postMeta.prompt.length > 120 ? `${postMeta.prompt.slice(0, 117)}…` : postMeta.prompt}
            </div>
          </div>
        )}

        {/* Error */}
        {actionError && (
          <div className="splash-section">
            <div className="alert-error">{actionError}</div>
          </div>
        )}

        {/* Tournaments section (non-tournament posts) */}
        {!isTournamentPost && (
          <div className="splash-section">
            <div className="splash-section-label">Tournaments</div>
            {isModerator ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="vsc-input"
                  placeholder="Tournament name (optional)"
                  value={createName}
                  maxLength={80}
                  onChange={e => setCreateName(e.target.value)}
                />
                <button type="button" className="vsc-btn vsc-btn-ghost" style={{ width: '100%' }} disabled={busy} onClick={() => void onCreateTournament()}>
                  {busy ? 'Creating…' : 'Create 24h tournament'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: '0.6875rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
                Mods create tournaments. Open a tournament post to join.
              </p>
            )}
            {openTournaments.length > 0 && (
              <div style={{ marginTop: '0.6rem' }}>
                {openTournaments.map(t => (
                  <div key={t.id} className="open-tournament-row">
                    <span className="open-tournament-name">{t.name}</span>
                    <span style={{ flexShrink: 0 }}>{t.participantCount}/{t.maxPlayers} · {formatEndsAt(t.endsAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ranking rule footnote */}
        <div className="splash-section" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--color-dim)' }}>
            Rank: most correct words first, ties by lowest time
          </p>
        </div>
      </div>

      {/* ── Pinned CTA ── */}
      <div className="splash-cta">
        {isTournamentPost && !joined && tournamentOpen && (
          <button type="button" className="vsc-btn vsc-btn-lg" style={{ width: '100%' }} disabled={busy} onClick={() => void onJoin()}>
            {busy ? 'Joining…' : 'Join tournament'}
          </button>
        )}
        {(canPlayTournament || !isTournamentPost) && (
          <button ref={playBtnRef} type="button" className="vsc-btn vsc-btn-lg" style={{ width: '100%' }} disabled={isTournamentPost && !canPlayTournament}>
            {isTournamentPost ? 'Race in tournament' : hasPostChallenge ? 'Play challenge' : 'Play Echokeys'}
          </button>
        )}
        {isTournamentPost && joined && !tournamentOpen && (
          <p style={{ textAlign: 'center', fontSize: '0.6875rem', color: 'var(--color-muted)' }}>
            Tournament closed — view standings on the leaderboard.
          </p>
        )}
        <button ref={lbBtnRef} type="button" className="vsc-btn vsc-btn-ghost vsc-btn-lg" style={{ width: '100%' }}>
          {isTournamentPost ? 'Tournament standings' : 'Leaderboard'}
        </button>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<StrictMode><Splash /></StrictMode>);

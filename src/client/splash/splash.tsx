import '../index.css';
import { context, navigateTo, requestExpandedMode } from '../shims/devvit-web-client';
import { StrictMode, useRef, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { LeaderboardEntry, Tournament, TournamentSummary } from '../../shared/types/index';

type PostMeta = {
  mode?: string;
  challengeId?: string;
  tournamentId?: string;
  prompt?: string;
  domain?: string;
};

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
  const [username, setUsername] = useState(context?.username ?? 'Typist');
  const [wordsTyped, setWordsTyped] = useState<number | null>(null);
  const [subredditName, setSubredditName] = useState('');
  const [postMeta, setPostMeta] = useState<PostMeta | null>(null);
  const [bestCorrectWords, setBestCorrectWords] = useState<number | null>(null);
  const [bestTimeSeconds, setBestTimeSeconds] = useState<number | null>(null);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [standings, setStandings] = useState<LeaderboardEntry[]>([]);
  const [joined, setJoined] = useState(false);
  const [openTournaments, setOpenTournaments] = useState<TournamentSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [isModerator, setIsModerator] = useState(false);

  const playBtnRef = useRef<HTMLButtonElement>(null);
  const lbBtnRef = useRef<HTMLButtonElement>(null);

  const isTournamentPost = Boolean(
    postMeta?.mode === 'tournament' || postMeta?.tournamentId || tournament
  );

  const refreshMe = useCallback(async () => {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const me = await res.json();
    if (me.username) setUsername(me.username);
    if (me.subredditName) setSubredditName(me.subredditName);
    setIsModerator(Boolean(me.isModerator));
    if (me.profile?.totalWordsTyped != null) {
      setWordsTyped(me.profile.totalWordsTyped as number);
    }
    if (me.profile?.bestCorrectWords != null) {
      setBestCorrectWords(me.profile.bestCorrectWords as number);
    }
    if (me.profile?.bestTimeSeconds != null) {
      setBestTimeSeconds(me.profile.bestTimeSeconds as number);
    }
    if (me.postData && typeof me.postData === 'object') {
      setPostMeta(me.postData as PostMeta);
    }
  }, []);

  const loadTournamentContext = useCallback(async () => {
    const [postRes, listRes] = await Promise.all([
      fetch('/api/post/tournament'),
      fetch('/api/tournaments'),
    ]);
    if (postRes.ok) {
      const data = await postRes.json();
      if (data.tournament) {
        setTournament(data.tournament as Tournament);
        setStandings((data.standings as LeaderboardEntry[]) || []);
        setJoined(Boolean(data.joined));
      }
    }
    if (listRes.ok) {
      const data = await listRes.json();
      const list = (data.tournaments as TournamentSummary[]) || [];
      setOpenTournaments(list.filter((t) => t.status === 'open').slice(0, 5));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshMe();
        await loadTournamentContext();
      } catch {
        // local / offline
      }
    })();
  }, [refreshMe, loadTournamentContext]);

  useEffect(() => {
    const playBtn = playBtnRef.current;
    const lbBtn = lbBtnRef.current;

    const onPlay = (e: MouseEvent) => {
      requestExpandedMode(e, 'game').catch(() => {
        window.location.assign('game.html');
      });
    };

    const onLb = (e: MouseEvent) => {
      requestExpandedMode(e, 'leaderboard').catch(() => {
        window.location.assign('leaderboard.html');
      });
    };

    playBtn?.addEventListener('click', onPlay);
    lbBtn?.addEventListener('click', onLb);

    return () => {
      playBtn?.removeEventListener('click', onPlay);
      lbBtn?.removeEventListener('click', onLb);
    };
  }, [isTournamentPost, joined, tournament?.status]);

  const onJoin = async () => {
    if (!tournament?.id) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/tournament/${encodeURIComponent(tournament.id)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      setTournament(data.tournament as Tournament);
      setStandings((data.standings as LeaderboardEntry[]) || []);
      setJoined(true);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setBusy(false);
    }
  };

  const onCreateTournament = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch('/api/tournament/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim() || undefined,
          durationHours: 24,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create tournament');
      const url = data.postUrl as string | undefined;
      if (url) {
        await navigateTo(url);
      } else {
        setActionError('Tournament created — open it from the community feed.');
        await loadTournamentContext();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setBusy(false);
    }
  };

  const communityLabel = subredditName
    ? subredditName.startsWith('r/')
      ? subredditName
      : `r/${subredditName}`
    : '';

  const hasPostChallenge = Boolean(postMeta?.challengeId) && !isTournamentPost;
  const showStats =
    (wordsTyped != null && wordsTyped > 0) ||
    (bestCorrectWords != null && bestCorrectWords > 0);
  const tournamentOpen = tournament?.status === 'open' && (tournament.endsAt ?? 0) > Date.now();
  const canPlayTournament = isTournamentPost && joined && tournamentOpen;

  return (
    <div className="app-shell">
      <div className="app-center" style={{ gap: '0.65rem' }}>
        <div style={{ textAlign: 'center', width: '100%', maxWidth: '24rem' }}>
          <h1
            style={{
              fontSize: 'clamp(1.35rem, 5vw, 1.75rem)',
              fontWeight: 700,
              color: 'var(--color-vsc-accent)',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              marginBottom: '0.2rem',
            }}
          >
            Echokeys
          </h1>
          <p className="muted" style={{ fontSize: '0.75rem' }}>
            {isTournamentPost
              ? 'Community tournament — same excerpt for everyone. Best correct words wins.'
              : 'Race a random 2,000+ word excerpt. Rank by correct words and time.'}
          </p>
          {communityLabel && (
            <p
              className="mono"
              style={{ fontSize: '0.6875rem', color: 'var(--color-vsc-green)', marginTop: '0.25rem' }}
            >
              {communityLabel}
            </p>
          )}
        </div>

        <div className="vsc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', marginBottom: '0.15rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--color-vsc-green)' }}>{username}</span>
            </p>
            <p className="muted" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
              {isTournamentPost
                ? 'Join, race once or more — only your best run ranks.'
                : 'Most correct words wins; ties break on lowest time.'}
            </p>
          </div>

          {showStats && !isTournamentPost && (
            <div
              className="mono"
              style={{
                display: 'grid',
                gridTemplateColumns:
                  wordsTyped && bestCorrectWords ? '1fr 1fr' : '1fr',
                gap: '0.35rem',
              }}
            >
              {wordsTyped != null && wordsTyped > 0 && (
                <div className="stat-box">
                  <div className="stat-val" style={{ color: 'var(--color-vsc-orange)', fontSize: '1.05rem' }}>
                    {wordsTyped.toLocaleString()}
                  </div>
                  <div className="stat-lbl">Words</div>
                </div>
              )}
              {bestCorrectWords != null && bestCorrectWords > 0 && (
                <div className="stat-box">
                  <div className="stat-val" style={{ fontSize: '1.05rem', color: 'var(--color-vsc-green)' }}>
                    {bestCorrectWords.toLocaleString()}
                    {bestTimeSeconds != null && bestTimeSeconds > 0
                      ? ` · ${bestTimeSeconds}s`
                      : ''}
                  </div>
                  <div className="stat-lbl">Best run</div>
                </div>
              )}
            </div>
          )}

          {isTournamentPost && tournament && (
            <div
              style={{
                padding: '0.45rem 0.5rem',
                borderRadius: 2,
                background: 'var(--color-vsc-bg-darker)',
                border: '1px solid var(--color-vsc-border)',
                textAlign: 'left',
              }}
            >
              <p
                className="muted"
                style={{
                  fontSize: '0.5625rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.2rem',
                }}
              >
                Tournament
              </p>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-vsc-cyan)' }}>
                {tournament.name}
              </p>
              <p className="mono muted" style={{ fontSize: '0.625rem', marginTop: '0.25rem' }}>
                Host @{tournament.createdBy} · {tournament.participants.length}/{tournament.maxPlayers} joined ·{' '}
                {formatEndsAt(tournament.endsAt)} · {tournament.status}
              </p>
              {standings.length > 0 && (
                <div style={{ marginTop: '0.4rem' }}>
                  {standings.slice(0, 5).map((row) => (
                    <div
                      key={row.username}
                      className="mono"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.625rem',
                        padding: '0.1rem 0',
                        color: row.username === username.toLowerCase() ? 'var(--color-vsc-green)' : undefined,
                      }}
                    >
                      <span>
                        #{row.rank} {row.username}
                      </span>
                      <span>
                        {row.bestCorrectWords}w · {row.bestTimeSeconds}s
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasPostChallenge && postMeta?.prompt && (
            <div
              style={{
                padding: '0.45rem 0.5rem',
                borderRadius: 2,
                background: 'var(--color-vsc-bg-darker)',
                border: '1px solid var(--color-vsc-border)',
                textAlign: 'left',
              }}
            >
              <p
                className="muted"
                style={{
                  fontSize: '0.5625rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.2rem',
                }}
              >
                This post
              </p>
              <p
                className="mono"
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--color-vsc-cyan)',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                {postMeta.prompt.length > 100
                  ? `${postMeta.prompt.slice(0, 97)}…`
                  : postMeta.prompt}
              </p>
            </div>
          )}

          {actionError && (
            <p className="mono" style={{ fontSize: '0.6875rem', color: 'var(--color-vsc-red)' }}>
              {actionError}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {isTournamentPost && !joined && tournamentOpen && (
              <button
                type="button"
                className="vsc-btn vsc-btn-lg"
                style={{ width: '100%' }}
                disabled={busy}
                onClick={() => void onJoin()}
              >
                {busy ? 'Joining…' : 'Join tournament'}
              </button>
            )}

            {(canPlayTournament || !isTournamentPost) && (
              <button
                ref={playBtnRef}
                type="button"
                className="vsc-btn vsc-btn-lg"
                style={{ width: '100%' }}
                disabled={isTournamentPost && !canPlayTournament}
              >
                {isTournamentPost
                  ? 'Race in tournament'
                  : hasPostChallenge
                    ? 'Play challenge'
                    : 'Play Echokeys'}
              </button>
            )}

            {isTournamentPost && joined && !tournamentOpen && (
              <p className="muted" style={{ fontSize: '0.6875rem', textAlign: 'center' }}>
                Tournament closed — view standings on the leaderboard.
              </p>
            )}

            <button ref={lbBtnRef} type="button" className="vsc-btn vsc-btn-ghost vsc-btn-lg" style={{ width: '100%' }}>
              {isTournamentPost ? 'Tournament standings' : 'Leaderboard'}
            </button>
          </div>

          {!isTournamentPost && (
            <div
              style={{
                marginTop: '0.25rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid var(--color-vsc-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <p
                className="muted"
                style={{
                  fontSize: '0.5625rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Tournaments
              </p>
              {isModerator ? (
                <>
                  <input
                    type="text"
                    className="vsc-input"
                    placeholder="Name (optional)"
                    value={createName}
                    maxLength={80}
                    onChange={(e) => setCreateName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.5rem',
                      borderRadius: 2,
                      border: '1px solid var(--color-vsc-border)',
                      background: 'var(--color-vsc-bg-darker)',
                      color: 'var(--color-vsc-text)',
                      fontSize: '0.75rem',
                    }}
                  />
                  <button
                    type="button"
                    className="vsc-btn vsc-btn-ghost"
                    style={{ width: '100%' }}
                    disabled={busy}
                    onClick={() => void onCreateTournament()}
                  >
                    {busy ? 'Creating…' : 'Create 24h tournament'}
                  </button>
                </>
              ) : (
                <p className="muted" style={{ fontSize: '0.625rem', lineHeight: 1.4 }}>
                  Mods create tournaments. Open a tournament post to{' '}
                  <strong style={{ color: 'var(--color-vsc-green)', fontWeight: 600 }}>join</strong>.
                </p>
              )}
              {openTournaments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {openTournaments.map((t) => (
                    <div
                      key={t.id}
                      className="mono"
                      style={{
                        fontSize: '0.625rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.35rem',
                        color: 'var(--color-vsc-text-muted)',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name}
                      </span>
                      <span style={{ flexShrink: 0 }}>
                        {t.participantCount}/{t.maxPlayers} · {formatEndsAt(t.endsAt)}
                      </span>
                    </div>
                  ))}
                  <p className="muted" style={{ fontSize: '0.5625rem' }}>
                    {isModerator
                      ? 'Or use subreddit menu → Create Echokeys Tournament.'
                      : 'Find open tournament posts in the community feed to join.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="muted mono" style={{ fontSize: '0.5625rem', textAlign: 'center', opacity: 0.7 }}>
          Rank: most correct words, then lowest time
        </p>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);

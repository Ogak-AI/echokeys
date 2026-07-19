import '../index.css';
import { context, requestExpandedMode } from '../shims/devvit-web-client';
import { StrictMode, useRef, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

type PostMeta = {
  challengeId?: string;
  prompt?: string;
  domain?: string;
};

const Splash = () => {
  const [username, setUsername] = useState(context?.username ?? 'Typist');
  const [wordsTyped, setWordsTyped] = useState<number | null>(null);
  const [subredditName, setSubredditName] = useState('');
  const [postMeta, setPostMeta] = useState<PostMeta | null>(null);
  const [bestWpm, setBestWpm] = useState<number | null>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const lbBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) return;
        const me = await res.json();
        if (me.username) setUsername(me.username);
        if (me.subredditName) setSubredditName(me.subredditName);
        if (me.profile?.totalWordsTyped != null) {
          setWordsTyped(me.profile.totalWordsTyped as number);
        }
        if (me.profile?.bestWpm != null) {
          setBestWpm(me.profile.bestWpm as number);
        }
        if (me.postData && typeof me.postData === 'object') {
          setPostMeta(me.postData as PostMeta);
        }
      } catch {
        // local / offline
      }
    })();
  }, []);

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
  }, []);

  const communityLabel = subredditName
    ? subredditName.startsWith('r/')
      ? subredditName
      : `r/${subredditName}`
    : '';

  const hasPostChallenge = Boolean(postMeta?.challengeId);
  const showStats =
    (wordsTyped != null && wordsTyped > 0) || (bestWpm != null && bestWpm > 0);

  return (
    <div className="app-shell">
      <div className="app-center" style={{ gap: '0.65rem' }}>
        {/* Title strip — VS Code status-bar vibe */}
        <div style={{ textAlign: 'center', width: '100%', maxWidth: '24rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              marginBottom: '0.2rem',
            }}
          >
            <span style={{ fontSize: '1.15rem', lineHeight: 1 }} aria-hidden>
              ⌨️
            </span>
            <h1
              style={{
                fontSize: 'clamp(1.35rem, 5vw, 1.75rem)',
                fontWeight: 700,
                color: 'var(--color-vsc-accent)',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              }}
            >
              Echokeys
            </h1>
          </div>
          <p className="muted" style={{ fontSize: '0.75rem' }}>
            AI writes it. You race typing it.
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
              Welcome,{' '}
              <span style={{ fontWeight: 600, color: 'var(--color-vsc-green)' }}>{username}</span>
            </p>
            <p className="muted" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
              Type AI challenges. Climb your sub&apos;s weekly board. Accuracy wins.
            </p>
          </div>

          {showStats && (
            <div
              className="mono"
              style={{
                display: 'grid',
                gridTemplateColumns: showStats && wordsTyped && bestWpm ? '1fr 1fr' : '1fr',
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
              {bestWpm != null && bestWpm > 0 && (
                <div className="stat-box">
                  <div className="stat-val" style={{ fontSize: '1.05rem' }}>
                    {bestWpm}
                  </div>
                  <div className="stat-lbl">Best WPM</div>
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
              {postMeta.domain && (
                <p className="muted" style={{ fontSize: '0.5625rem', marginTop: '0.2rem', textTransform: 'capitalize' }}>
                  {postMeta.domain}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <button ref={playBtnRef} className="vsc-btn vsc-btn-lg" style={{ width: '100%' }}>
              {hasPostChallenge ? '▶ Play Challenge' : '▶ Start Challenge'}
            </button>
            <button ref={lbBtnRef} className="vsc-btn vsc-btn-ghost vsc-btn-lg" style={{ width: '100%' }}>
              🏆 Leaderboard
            </button>
          </div>
        </div>

        <p className="muted mono" style={{ fontSize: '0.5625rem', textAlign: 'center', opacity: 0.7 }}>
          Score = (Acc% × 100) + WPM − (time/60)
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

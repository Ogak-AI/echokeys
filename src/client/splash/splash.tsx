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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#1e1e1e] text-[#d4d4d4]">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="text-3xl" aria-hidden>
            ⌨️
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-[#007acc]">Echokeys</h1>
        </div>
        <p className="text-sm text-[#858585]">
          Prompt in. AI writes it. You race the community typing it.
        </p>
        {communityLabel && (
          <p className="text-xs font-mono text-[#4ec9b0] mt-2">{communityLabel}</p>
        )}
      </div>

      <div className="w-full max-w-md rounded p-6 mb-6 bg-[#252526] border border-[#3c3c3c]">
        <div className="text-center">
          <p className="text-lg mb-1">
            Welcome,{' '}
            <span className="font-semibold text-[#4ec9b0]">{username}</span>
          </p>
          <p className="text-xs text-[#858585] leading-relaxed">
            Type AI-generated challenges. Compete on your subreddit&apos;s weekly leaderboard.
            Accuracy matters most.
          </p>

          {(wordsTyped != null && wordsTyped > 0) || (bestWpm != null && bestWpm > 0) ? (
            <div className="flex justify-center gap-6 mt-4 font-mono text-xs">
              {wordsTyped != null && wordsTyped > 0 && (
                <div>
                  <div className="text-[#ce9178] text-base font-bold">
                    {wordsTyped.toLocaleString()}
                  </div>
                  <div className="text-[#858585]">words typed</div>
                </div>
              )}
              {bestWpm != null && bestWpm > 0 && (
                <div>
                  <div className="text-[#9cdcfe] text-base font-bold">{bestWpm}</div>
                  <div className="text-[#858585]">best WPM</div>
                </div>
              )}
            </div>
          ) : null}

          {hasPostChallenge && postMeta?.prompt && (
            <div className="mt-4 p-3 rounded bg-[#181818] border border-[#3c3c3c] text-left">
              <p className="text-[10px] uppercase tracking-wider text-[#858585] mb-1">
                This post&apos;s challenge
              </p>
              <p className="text-xs text-[#9cdcfe] font-mono leading-relaxed">
                {postMeta.prompt.length > 140
                  ? `${postMeta.prompt.slice(0, 137)}…`
                  : postMeta.prompt}
              </p>
              {postMeta.domain && (
                <p className="text-[10px] text-[#858585] mt-1 capitalize">{postMeta.domain}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          ref={playBtnRef}
          className="vsc-btn vsc-btn-lg w-full justify-center text-base font-semibold"
        >
          {hasPostChallenge ? '▶ Play This Challenge' : '▶ Start Challenge'}
        </button>
        <button
          ref={lbBtnRef}
          className="vsc-btn-ghost vsc-btn vsc-btn-lg w-full justify-center text-base"
        >
          🏆 Community Leaderboard
        </button>
      </div>

      <div className="mt-10 text-center text-[11px] text-[#3c3c3c] space-y-1">
        <p>Score = (Accuracy% × 100) + WPM − (time/60)</p>
        <p>Free &amp; open source · Devvit · VS Code Dark</p>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);

# Echokeys

Echokeys is a free typing race that runs inside Reddit. Anyone can play — engineers, writers, students, or anyone who likes a timed challenge.

You open a community post, start a race, and type a long excerpt the app picked for you. Scores rank on that community’s leaderboards (weekly, monthly, yearly, and all-time).

## What players do

1. Open a **Play Echokeys Typing Game** post in the community.
2. Tap **Play** to start a race.
3. Type the on-screen excerpt as accurately and quickly as you can (about 2,000+ words, 4-minute cap).
4. Finish or time out — eligible runs appear on the community leaderboard.
5. Open **Leaderboard** from the same post to see weekly / monthly / yearly / all-time ranks.

You never paste your own text. The app always chooses a random excerpt from its built-in source pool (starts at a random sentence, takes the next 2,000+ words, ends on a complete sentence).

### Ranking

1. Most correct words wins  
2. If tied, lowest time wins  
3. Further ties: accuracy, then WPM  

Partial runs rank when they have **20+ correct words**, or **50%+** progress with at least one correct word. Each player keeps their **best single run** for the period.

## What moderators do

1. Install **echokeys** on your subreddit from the Reddit apps directory (or Devvit developer tools).
2. On install, the app creates a **Play Echokeys Typing Game** hub post if one is not already live.
3. Optionally pin that post so members always see it.
4. Use the subreddit menu when you need more posts:
   - **Post Echokeys Game** — free-play hub  
   - **Create Echokeys Challenge** — fixed race posted as the user who created it  
   - **Create Echokeys Tournament** — mods only; shared-excerpt community cup  

No API keys or external services. No configuration required.

## Tournaments

**Moderators only** create tournaments (menu or hub form). Members join open tournament posts and race.

1. **Create (mods)** — shared excerpt; creator auto-joined; post published (default 24h).
2. **Join (anyone)** — open post → **Join tournament** (capacity default 50).
3. **Race** — same text; best correct-words run ranks on standings.
4. **Standings** — Cup tab on the leaderboard while the post is open.

When time ends, joins and ranked runs stop. Weekly/all-time boards still update from eligible races.

## Audio

Races start muted. **Read** or **Unmute** starts narration; **Mute** in the header or audio bar stops it immediately.

## Leaderboards that survive reinstall

Devvit clears installation Redis when an app is uninstalled. Echokeys mirrors ranks to a **private subreddit wiki page** (`echokeys/leaderboard-backup`, mods-only, unlisted) so data can come back:

| Event | What happens |
|--------|----------------|
| Ranked score (throttled) | Backup to wiki |
| Daily job (06:00 UTC) | Full wiki backup |
| Weekly / monthly / yearly snapshot | Archive + **immutable freeze** + wiki backup |
| Tournament end | Standings frozen permanently |
| Install or upgrade | Restore from wiki into Redis, bootstrap permanence meta, refresh wiki |

App code **never deletes** leaderboard or permanence Redis keys, never overwrites a non-empty board with empty data, and **merges** on restore (best run wins). Frozen period snapshots refuse divergent overwrites (historical winners stay sealed).

**Notes**

- The **Weekly** tab is the current week only (new week starts empty by design). Past weeks are archived/frozen; **All-time** stays stored.
- Player **career** counters (races, weekly top-3, tournament wins) live on the profile and do not reset with the weekly board.
- Wiki restore needs the app to edit the subreddit wiki (normal for installed apps with mod rights). If wiki is disabled for the community, ranks still work in Redis until uninstall.
- Moderators should not manually edit the backup page.
- If ranks look empty after a reinstall or playtest reset: open the subreddit menu → **Restore Echokeys Leaderboard** (mods). Opening Rankings also auto-tries a wiki restore when all-time is empty.
- Confirm the backup page exists: `https://www.reddit.com/r/<your_sub>/wiki/echokeys/leaderboard-backup` (mods only).

## Privacy and data

- Stores usernames, scores, and typing stats for races played in communities where the app is installed.
- Data is used only for gameplay, leaderboards, and badges in that community.
- No ads, no external analytics, no sale of data.
- No account linking outside Reddit.

## For developers

```bash
npm install
npm test
npm run check
npm run build
npm run dev       # build + playtest on r/echokeys_dev
npm run deploy    # build + upload
npm run publish:app
```

| Path | Purpose |
|------|---------|
| `content/knowledge-base.txt` | Built-in race source pool (≥ 2,000 words) |
| `src/client/` | Splash, game, leaderboard UI |
| `src/server/` | API, leaderboards, freezes, wiki backup |
| `src/shared/` | Types, ranking helpers, race excerpt, permanence types |
| `tests/` | Unit tests (incl. permanence / integrity) |
| `docs/` | Architecture, Redis inventory, deploy guide |

Playtest community: `r/echokeys_dev` (`dev.subreddit` in `devvit.json`).

### Deploy checklist

See **`docs/DEPLOY.md`**. Minimum gate: `npm test && npm run check && npm run build`.

### Knowledge base

Edit `content/knowledge-base.txt`, then `npm run build`. Plain text with real sentence endings (`. ! ?`).

Optional local env (`.env.template`):

- `DEVVIT_SUBREDDIT` — playtest subreddit for `npm run dev`

### Ops endpoints (server)

| Path | Purpose |
|------|---------|
| `GET /api/health` | Liveness |
| `GET /api/health?integrity=1` | Permanence integrity report |
| `GET /api/history/:kind` | List frozen period keys |
| `GET /api/history/:kind/:periodKey` | Immutable snapshot |

## License

BSD-3-Clause — see `LICENSE`.

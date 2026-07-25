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

Partial runs need **50%+** progress to rank. Each player keeps their **best single run** for the period.

## What moderators do

1. Install **echokeys** on your subreddit from the Reddit apps directory (or Devvit developer tools).
2. On install, the app creates a **Play Echokeys Typing Game** hub post if one is not already live.
3. Optionally pin that post so members always see it.
4. Use the subreddit menu when you need more posts:
   - **Post Echokeys Game** — free-play hub  
   - **Create Echokeys Challenge** — fixed race posted as the user who created it  

No API keys or external services. No configuration required.

## Leaderboards that survive reinstall

Devvit clears installation Redis when an app is uninstalled. Echokeys mirrors ranks to a **private subreddit wiki page** (`echokeys/leaderboard-backup`, mods-only, unlisted) so data can come back:

| Event | What happens |
|--------|----------------|
| Ranked score (throttled) | Backup to wiki |
| Daily job (06:00 UTC) | Full wiki backup |
| Weekly / monthly / yearly snapshot | Snapshot + wiki backup |
| Install or upgrade | Restore from wiki into Redis, then refresh wiki |

App code **never deletes** leaderboard Redis keys, never overwrites a non-empty board with empty data, and **merges** on restore (best run wins).

**Notes**

- The **Weekly** tab is the current week only (new week starts empty by design). Past weeks and **All-time** stay stored.
- Wiki restore needs the app to edit the subreddit wiki (normal for installed apps with mod rights). If wiki is disabled for the community, ranks still work in Redis until uninstall.
- Moderators should not manually edit the backup page.

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
npx devvit publish
```

| Path | Purpose |
|------|---------|
| `content/knowledge-base.txt` | Built-in race source pool (≥ 2,000 words) |
| `src/client/` | Splash, game, leaderboard UI |
| `src/server/` | API, leaderboards, wiki backup |
| `src/shared/` | Types, ranking helpers, race excerpt |
| `tests/` | Unit tests |

Playtest community: `r/echokeys_dev` (`dev.subreddit` in `devvit.json`).

Example review post: create or open **Play Echokeys Typing Game** on the development subreddit after `npx devvit install echokeys_dev`.

### Knowledge base

Edit `content/knowledge-base.txt`, then `npm run build`. Plain text with real sentence endings (`. ! ?`).

Optional local env (`.env.template`):

- `DEVVIT_SUBREDDIT` — playtest subreddit for `npm run dev`

## License

BSD-3-Clause — see `LICENSE`.

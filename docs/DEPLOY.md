# Echokeys Deployment Guide

## Prerequisites

- Node.js 22+ recommended (server Vite target is `node22`)
- Devvit CLI login: `npm run login`
- App installed on a subreddit with wiki edit rights for backup restore

## Local verification (required before upload)

```bash
npm install
npm test
npm run check
npm run build
```

All must succeed.

## Playtest

```bash
npm run dev
```

Uses `dev.subreddit` from `devvit.json` (`echokeys_dev`).  
Open **Play Echokeys Typing Game** on the playtest subreddit.

## Upload / publish

```bash
npm run deploy          # build + devvit upload
npm run publish:app     # build + upload + publish
```

## Post-deploy smoke

1. Open hub post → Play → complete a short eligible run (or confirm race starts).
2. Leaderboard loads weekly / all-time.
3. Optional integrity check (ops): `GET /api/health?integrity=1`  
   - `status: ok` and `integrity.ok: true` preferred  
   - First install may report meta missing until first freeze/bootstrap
4. After a week boundary (or scheduler), confirm frozen history:  
   `GET /api/history/weekly`

## Data safety (do not violate)

- Never manually delete Redis keys matching `lb:*` or `perm:*`
- Never manually wipe the wiki page `echokeys/leaderboard-backup`
- Deployments must not ship destructive migrations
- Permanence freezes are write-once; divergent overwrites are refused by design

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Scores rejected | Auth, race session, speed ceiling, rate limit |
| Empty leaderboard | New week, or no eligible runs yet |
| Ranks lost after reinstall | Subreddit menu → **Restore Echokeys Leaderboard** (mods). Opening Rankings auto-hydrates from wiki when all-time is empty. Check `wiki/echokeys/leaderboard-backup` |
| Integrity degraded | Logs `[Permanence]`; inspect checksum issues |
| Knowledge base errors | Rebuild after editing `content/knowledge-base.txt` |

## Rollback

1. Redeploy previous known-good upload via Devvit.
2. Freezes and Redis history remain unless platform Redis was wiped.
3. If Redis empty: reinstall path restores from wiki (merge, not wipe).

# Echokeys — AI Coding Guidelines

## Architecture

Echokeys is a **Devvit** Reddit app (typing race):

| Path | Role |
|------|------|
| `src/client/` | React multi-page UI: splash, game, leaderboard |
| `src/server/` | Express API, Redis, wiki backup, permanence freezes |
| `src/shared/` | Types, anti-cheat, race excerpts, time keys |
| `content/knowledge-base.txt` | Built-in race source pool |
| `tests/` | Vitest unit tests |
| `docs/` | Architecture, Redis inventory, audit notes |

## Data flow

- Client uses `fetch('/api/…')` for all server calls.
- Identity comes from Reddit context (`@devvit/web/server`), never from client body.
- Scores are **server-authoritative** (typed text + race session clock).
- Persistence: Devvit Redis; cold mirror on subreddit wiki; immutable freezes under `perm:snap:*`.

## Commands

```bash
npm install
npm test
npm run check
npm run build
npm run dev      # build + devvit playtest
npm run deploy   # build + upload
```

Playtest subreddit: `r/echokeys_dev` (`devvit.json` → `dev.subreddit`).

## Conventions

- Prefer `type` aliases for data shapes.
- Shared ranking/anti-cheat lives in `src/shared` — keep client and server consistent.
- **Never** `redis.del` on leaderboard or permanent (`perm:*`) keys.
- Frozen snapshots are write-once; do not overwrite divergent history.
- Logging uses prefixed `console.*` (`[API]`, `[Permanence]`, `[WikiBackup]`) for ops.

## Pitfalls

- No Node filesystem on Devvit server for app data — use Redis / wiki.
- No raw WebSockets — use Devvit realtime for live weekly boards.
- Race sessions are one-shot; do not mint a new race after typing ends.
- Tests use `tests/helpers/redisMock.ts`; call `memoryCache.clear()` in `beforeEach`.

# Echokeys Redis Key Inventory

Verified from source (`src/server/**`). Devvit Redis is **per app installation** (per subreddit).

**Last aligned with code:** permanence freezes (`perm:*`), race/rate TTL, wipe-safe boards.

| Key pattern | Written by | TTL | Cleanup / bound | Concurrent writes |
|-------------|------------|-----|-----------------|-------------------|
| `challenge:{id}` | `saveChallenge` | none (in-memory cache 1h) | Unbounded growth over time | last-write wins |
| `race:{id}` | `createRaceSession` | ~race TTL + 60s via `expire` | TTL + claim delete | claim-token one-shot |
| `race_open:{user}:{challenge}` | race start | same as race | TTL + del on claim/start | replace previous |
| `score:{id}` | `saveScore` | none | Via idx cap only | append-only |
| `scores:idx:{user}` | `saveScore` | none | Max 100 ids | RMW |
| `player:{username}` | profile updates | none | one key per player | RMW merge |
| `lb:{sub}:weekly:{YYYY-MM-DD}` | score / restore | none | top 25; never del | merge/replace wipe-safe |
| `lb:{sub}:weekly:archive:{date}` | snapshot | none | top 25; archive index 520 | replace merge |
| `lb:{sub}:weekly:archives` | snapshot | none | list cap 520 | RMW |
| `lb:{sub}:monthly:{YYYY-MM}` | snapshot | none | top 25 | replace merge |
| `lb:{sub}:monthly:index` | snapshot | none | list cap 520 | RMW |
| `lb:{sub}:yearly:{YYYY}` | snapshot | none | top 50 | replace merge |
| `lb:{sub}:alltime` | score / snapshot | none | top 100 | alltime merge |
| `tournament:{id}` | create/join | none | open list index capped | RMW + post-join recheck |
| `tournament:{id}:standings` | scores | none | top 100 | RMW |
| `tournaments:idx:{sub}` | create | none | max 100 ids | RMW |
| `ratelimit:{action}:{id}:{hour}` | API | **2h expire** | TTL | RMW (+2 tolerance) |
| `hub-post:{sub}` | install/menu | none | single key | set |
| `echokeys:wiki-backup:last:{sub}` | wiki backup | none (single key) | throttle timestamp | set |
| `perm:meta:{sub}` | permanence bootstrap | **none (permanent)** | schema + migration log | merge-only |
| `perm:snap:{sub}:{kind}:{period}` | freezeSnapshot | **none (permanent)** | write-once frozen | refuse divergent overwrite |
| `perm:snapidx:{sub}:{kind}` | freezeSnapshot | **none (permanent)** | index cap 2000 | RMW unshift |

## Atomicity notes

- Devvit Redis used here: `get` / `set` / `del` / `expire` only — **no MULTI/WATCH**.
- Race claim uses claim-token write + confirm read.
- Leaderboard writes refuse empty wipe of non-empty boards.
- Tournament join re-reads after write and trims overflow.

## Wiki durability

- Page: `echokeys/leaderboard-backup` (mods-only, unlisted).
- Restore merges best-run; never empty-overwrite.

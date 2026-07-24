# Echokeys

Echokeys is a free, open-source typing race on Reddit’s Devvit platform. Anyone can use it — engineers, writers, lawyers, designers, marketers, students.

Players **do not paste text**. Each race is a **random excerpt** from the built-in source pool: the game picks a **random sentence**, then takes the **next 2,000+ words**, ending on a **complete sentence**. Type that excerpt character for character. No AI rewrite. Each subreddit has its own leaderboard (weekly / monthly / yearly / all-time).

## How it works

1. **Start a race** — Free-play in the app, or open a challenge post (subreddit menu → “Create Echokeys Challenge”)  
2. **Random excerpt** — Server starts at a random sentence in the source pool, takes ≥ 2,000 words, ends on a complete sentence  
3. **Players type it** — Green = correct, red = error; WPM / accuracy / timer are **client-side only** while racing  
4. **Anti-bot** — Cap at **7 words/sec**; exceed → **1.5s input lock**  
5. **One score upload** — On finish or timeout, a single payload hits the server  
6. **Community boards** — Per-subreddit weekly (Sun 00:00 UTC), monthly, yearly, all-time  

### Ranking rule

```
1. Most correct words wins
2. If tied, lowest time wins
3. Further ties: accuracy, then WPM
```

Each player keeps their **best single run** for the period. Partial runs need **50%+** progress to rank.

A display composite still exists for history only:

```
Display score = (Accuracy% × 100) + WPM − (Time_in_Seconds / 60)
```

It does **not** decide leaderboard order.

## Product rules

- Players only race text the server selected — **no player paste**  
- Race text is a contiguous excerpt: random sentence start → ≥ 2,000 words → complete sentence end  
- Typing math stays on-device; the server revalidates duration, speed, and correctness  
- Time cap is **4 minutes** per race  
- Leaderboards and badges are **per community**  
- Weekly top 3 → `Weekly Champion - r/subreddit` (same for monthly / yearly)  
- Lifetime word counter accumulates on every finished session  
- Teleprompter view keeps the cursor centered; TTS reads the challenge text (toggle with mute)

## Tech stack

| Layer | Choice |
|--------|--------|
| Platform | Devvit (auto-scales with Reddit) |
| Frontend | React + TypeScript + Tailwind (VS Code dark theme) |
| Backend | Express on Devvit |
| Storage | Devvit Redis/KV + in-memory cache |
| Realtime | Devvit realtime (leaderboard rank changes only) |
| Build | Vite |

## Scripts

```bash
npm install
npm test
npm run check
npm run build
npm run dev      # build + devvit playtest
npm run deploy   # build + devvit upload
npm run login    # devvit login
```

## Project layout

```text
content/
  knowledge-base.txt   # built-in source pool (bundled at build time)
src/
  client/   # splash, game, leaderboard UI
  server/   # Express API, leaderboards, race sessions
  shared/   # types, display score formula, anti-cheat helpers, race excerpt
tests/
```

## Configuration

No external API keys. Race text comes only from the built-in knowledge base.

### Built-in knowledge base

The source pool lives at:

```text
content/knowledge-base.txt
```

Requirements: **≥ 2,000 words**, plain text, real sentence endings (`. ! ?`).  
After editing, run `npm run build` (or `npm run dev`) so the server bundle picks it up. Free-play and challenge posts both draw **random excerpts** from this pool.

Optional local env (see `.env.template`):

- `DEVVIT_SUBREDDIT` — playtest subreddit for `npm run dev`

## License

BSD-3-Clause — see `LICENSE`.

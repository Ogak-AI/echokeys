# Echokeys

Echokeys is a free, open-source typing race on Reddit’s Devvit platform. Anyone can use it — engineers, writers, lawyers, designers, marketers, students.

You paste a **source document** (at least 2,000 words). The game picks a **random sentence**, then takes the **next 2,000+ words**, ending on a **complete sentence**. Players race typing that excerpt character for character. No AI rewrite. Each subreddit has its own leaderboard (weekly / monthly / yearly / all-time).

## How it works

1. **Create a challenge** — Subreddit menu → “Create Echokeys Challenge”, or free-play in the app, and paste a long source document  
2. **Random excerpt** — Server starts at a random sentence, takes ≥ 2,000 words, ends on a complete sentence  
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

- Source text is user-pasted only — **no AI generation or rewrite**  
- Race text is a contiguous excerpt: random sentence start → ≥ 2,000 words → complete sentence end  
- Typing math stays on-device; the server revalidates duration, speed, and correctness  
- Time cap is **90 minutes** (long races)  
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
  knowledge-base.txt   # optional built-in source pool (paste ≥ 2,000 words)
src/
  client/   # splash, game editor, leaderboard UI
  server/   # Express API, leaderboards, race sessions
  shared/   # types, display score formula, anti-cheat helpers, race excerpt
tests/
```

## Configuration

No external API keys. Challenges are built only from pasted source text (or the optional built-in knowledge base).

### Built-in knowledge base

Paste a long source document into:

```text
content/knowledge-base.txt
```

Requirements: **≥ 2,000 words**, plain text, real sentence endings (`. ! ?`).  
After editing, run `npm run build` (or `npm run dev`) so the server bundle picks it up. Free-play then offers **Race from knowledge base**.

Optional local env (see `.env.template`):

- `DEVVIT_SUBREDDIT` — playtest subreddit for `npm run dev`

## License

BSD-3-Clause — see `LICENSE`.

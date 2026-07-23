# Echokeys

Echokeys is a free, open-source typing race on Reddit’s Devvit platform. Anyone can use it — engineers, writers, lawyers, designers, marketers, students.

You paste the **exact text** players will type (a paragraph, a code snippet, a brief). Players race typing that same text, character for character. Each subreddit has its own leaderboard (weekly / monthly / yearly / all-time).

## How it works

1. **Create a challenge** — Subreddit menu → “Create Echokeys Challenge”, or start free-play in the app, and paste the text to race  
2. **Players type it** — Green = correct, red = error; WPM / accuracy / timer are **client-side only** while racing  
3. **Anti-bot** — Cap at **7 words/sec**; exceed → **1.5s input lock**  
4. **One score upload** — On finish or timeout, a single payload hits the server  
5. **Community boards** — Per-subreddit weekly (Sun 00:00 UTC), monthly, yearly, all-time  

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

- Players type **exactly the challenge text** — nothing is rewritten or AI-expanded  
- Typing math stays on-device; the server revalidates duration, speed, and correctness  
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
src/
  client/   # splash, game editor, leaderboard UI
  server/   # Express API, leaderboards, race sessions
  shared/   # types, display score formula, anti-cheat helpers, time keys
tests/
```

## Configuration

No external AI API keys are required. Challenges use the exact text the creator provides.

Optional local env (see `.env.template`):

- `DEVVIT_SUBREDDIT` — playtest subreddit for `npm run dev`

## License

BSD-3-Clause — see `LICENSE`.

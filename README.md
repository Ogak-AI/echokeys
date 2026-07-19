# Echokeys

Echokeys is a free, open-source typing game on Reddit’s Devvit platform. Anyone can use it—engineers, writers, lawyers, designers, marketers, students.

You submit a prompt (“Build a recursive function,” “Write a legal brief,” “Draft marketing copy”). The system **generates the content**. Players **race typing that AI-generated text**. Each subreddit has its own leaderboard (weekly / monthly / yearly / all-time).

## How it works

1. **Create a challenge** — Subreddit menu → “Create Echokeys Challenge” → enter a prompt  
2. **AI generates content** — Hugging Face or Groq (server-side); identical prompts are cached  
3. **Players type it** — Green = correct, red = error; WPM / accuracy / timer are **client-side only**  
4. **Anti-bot** — Cap at **7 words/sec**; exceed → **1.5s input lock**  
5. **One score upload** — On finish or timeout, a single payload hits the server  
6. **Community boards** — Per-subreddit weekly (Sun 00:00 UTC), monthly, yearly, all-time  

### Score formula

```
Score = (Accuracy% × 100) + WPM − (Time_in_Seconds / 60)
```

Accuracy matters most.

## Product rules

- Players type **what the AI generated**, never freeform writing  
- Typing math stays on-device; only the final score is trusted after server revalidation  
- Leaderboards and badges are **per community**  
- Weekly top 3 → `Weekly Champion - r/subreddit` (same for monthly / yearly)  
- Lifetime word counter accumulates on every finished session  
- Optional word pronunciation (muted by default)

## Tech stack

| Layer | Choice |
|--------|--------|
| Platform | Devvit (auto-scales with Reddit) |
| Frontend | React + TypeScript + Tailwind (VS Code dark theme) |
| Backend | Express on Devvit |
| Storage | Devvit Redis/KV + in-memory cache |
| Realtime | Devvit realtime (leaderboard rank changes only) |
| Content | Hugging Face / Groq (keys in app settings / env) |
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
  server/   # Express API, content gen, leaderboards, snapshots
  shared/   # types, score formula, anti-cheat helpers, time keys
tests/
```

## Configuration

In the Devvit app settings (or env for local):

- `llm_provider` — `huggingface` (default) or `groq`
- `huggingface_api_key` / `huggingface_model`
- `groq_api_key` / `groq_model`

Without keys, the server falls back to deterministic practice content so the game still works.

## License

BSD-3-Clause — see `LICENSE`.

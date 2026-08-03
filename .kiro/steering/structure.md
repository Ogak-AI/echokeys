# Project Structure

## Root

- `devvit.json` — entrypoints, permissions, menu, scheduler, triggers
- `package.json` — scripts and dependencies
- `tsconfig.json` — TypeScript project references (`src/client`, `src/shared`, `src/server`)
- `content/` — race source pool
- `assets/` — Devvit media (icon, splash, loading)
- `docs/` — architecture and operational docs
- `tests/` — Vitest suite

## `src/client/`

React multi-page app (Vite):

- `splash.html` / `splash/` — hub, join tournament, create tournament (mods)
- `game.html` / `game/` — typing race
- `leaderboard.html` / `leaderboard/` — rankings and profile
- `hooks/` — `useTypingGame`, `useLiveLeaderboard`
- `shims/devvit-web-client.ts` — Devvit client with local fallbacks
- `index.css` — design tokens and UI styles

## `src/server/`

Express + Devvit:

- `index.ts` — routes, auth, race lifecycle, scheduler endpoints
- `knowledgeBase.ts` — loads `content/knowledge-base.txt`
- `services/` — leaderboard, tournament, wikiBackup, permanence, realtime, memoryCache

## `src/shared/`

- `types/` — game + permanence types
- `utils/` — antiCheat, raceExcerpt, time, contentDomain

## Build output

- `dist/client/` — HTML/JS/CSS for Devvit post entrypoints
- `dist/server/index.cjs` — server bundle

## Patterns

- Client / server / shared split with project references
- REST JSON APIs under `/api/*`
- Internal Devvit endpoints under `/internal/*`

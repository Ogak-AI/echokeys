# Technology Stack

## Core

- **Devvit** 0.13.x — Reddit app platform
- **React 19** + **TypeScript** — client UI
- **Vite 6** — client multi-page build + server CJS bundle
- **Express 5** — HTTP API
- **Redis** (Devvit) — primary persistence
- **Subreddit wiki** — cold leaderboard backup
- **Vitest** — unit tests

## Commands

```bash
npm install
npm test
npm run check          # tsc --build
npm run build          # client + server
npm run dev            # build + devvit playtest
npm run deploy         # build + devvit upload
npm run publish:app    # build + upload + publish
```

## Workflow

1. Edit source under `src/` or `content/`.
2. `npm test` and `npm run check`.
3. `npm run build` before deploy.
4. `npm run dev` for playtest on `r/echokeys_dev`.

## Quality gates

- Unit tests (`npm test`)
- Typecheck (`npm run check`)
- CI: `.github/workflows/ci.yml` (install, check, test, build)

There is no ESLint toolchain in package.json; do not assume `eslint` is available.

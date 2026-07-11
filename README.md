# Echokeys

Echokeys is a Reddit/Devvit typing game where players generate a prompt, receive fresh challenge content, and race to type it as fast and accurately as possible. The app supports multiple content styles, difficulty levels, live leaderboards, and weekly/monthly/yearly historical snapshots.

## What the app does

- Generates typing challenges from user prompts
- Supports code, typing, marketing, legal, creative, and technical prompts
- Tracks WPM, accuracy, elapsed time, and final score
- Stores challenge and score history in a local SQLite database
- Publishes weekly, monthly, and yearly leaderboard snapshots
- Exposes live leaderboard updates through WebSockets

## Tech stack

- Platform: Devvit for Reddit
- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- Storage: SQLite via better-sqlite3
- Realtime: Socket.IO
- Testing: Node.js built-in test runner

## Getting started

### Prerequisites

- Node.js 22+
- npm
- A Devvit-enabled Reddit account (for local playtest/deploy)

### Install and run locally

```bash
git clone https://github.com/Ogak-AI/echokeys.git
cd echokeys
npm install
npm test
npm run dev
```

### Build for production

```bash
npm run build
```

## Available scripts

- `npm test` — runs the automated tests
- `npm run dev` — starts the client and server locally
- `npm run dev:client` — runs the Vite client only
- `npm run dev:server` — runs the Express server with tsx watch
- `npm run build` — builds the client and server bundles
- `npm run check` — runs the TypeScript checker
- `npm run lint` — runs ESLint

## Project structure

```text
src/
  client/      # React UI for the Devvit post experience
  server/      # Express API, leaderboard logic, scheduling, and DB
  shared/      # Shared types and utilities
 tests/        # Automated regression and generator tests
```

## Notes

- The current implementation uses a local SQLite database for development.
- Challenge generation falls back to deterministic local content when a remote model token is not configured.
- The app is structured for Devvit deployment through the configuration in devvit.json.

## License

This project is licensed under the BSD-3-Clause license in the repository.

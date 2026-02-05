# KeyScripture - AI Coding Guidelines

## Architecture Overview

KeyScripture is a Devvit-based Reddit app with a client-server architecture:

- **Client** (`src/client/`): React webview running in Reddit posts using Devvit's web client APIs
- **Server** (`src/server/`): Serverless Node.js backend with Redis storage, no filesystem access
- **Shared** (`src/shared/`): TypeScript types and utilities shared between client and server

## Key Patterns & Conventions

### Data Flow

- Client communicates with server via `fetch()` calls to API endpoints (e.g., `/api/init`, `/api/leaderboard`)
- Use `context` from `@devvit/web/client` for Reddit-specific features like user authentication
- Server uses `redis` from `@devvit/redis` for data persistence
- Realtime features use Devvit's realtime service, not WebSockets (despite socket.io dependency for legacy spectator code)

### TypeScript Practices

- Prefer type aliases over interfaces: `type ApiResponse = { ... }` not `interface ApiResponse { ... }`
- Shared types in `src/shared/types/api.ts` define all client-server contracts
- Use `import type` for type-only imports to avoid runtime bundling

### Client Development

- React hooks only; follow React rules strictly
- Navigation between post screens uses `requestExpandedMode()` from Devvit web client
- Audio feedback via Web Speech API with smart word detection (speak on punctuation/space)
- Text windowing: display 110 chars with cursor at position 40 for optimal readability

### Server Development

- Serverless environment: no `fs`, `http`, `https`, `net` modules
- Use `fetch()` instead of Node.js `http`/`https` for external requests
- Redis keys follow patterns like `user:${username}:stats`, `leaderboard:${difficulty}`
- Challenges loaded from `src/server/challenges.json` with fallback to hardcoded text

### Development Workflow

- `npm run dev`: Concurrently builds client/server and runs `devvit playtest` for Reddit testing
- `npm run deploy`: Builds and uploads to Devvit (test in `keyscripture_dev` subreddit)
- `npm run launch`: Full production deploy with `devvit publish`
- Use `devvit playtest` for local Reddit integration testing

### Real-time Features

- Spectator system uses Devvit realtime for live game watching
- Games broadcast updates every 2 seconds with current input, WPM, accuracy
- Active games list refreshes every 10 seconds

### Content & Challenges

- Easy mode: Simple practice text ("The quick brown fox...")
- Medium/Hard: Book of Esther chapters from `src/server/challenges/`
- Difficulty selection affects challenge text length and complexity

## Common Pitfalls

- Don't use WebSockets; Devvit realtime service handles live updates
- Client can't access server code directly; all communication via HTTP APIs
- No file I/O on server; data persists only in Redis
- Test in Reddit environment via `devvit playtest`; browser dev server insufficient

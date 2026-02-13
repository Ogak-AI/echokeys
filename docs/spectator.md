**Spectator System — Architecture & Usage**

- **Overview:** Stateless app servers use Redis for session state and Pub/Sub for cross-instance event distribution. Each app instance runs a WebSocket server at `/spectator`.
- **Redis keys:** `keyscripture:session:{sessionId}` (hash)
- **Channels:** `keyscripture:game:{sessionId}` and `keyscripture:lobby`

Files added under `src/server/realtime/`:
- `redisClient.ts` — single shared Redis client helper
- `pubsub.ts` — abstraction that creates a dedicated subscriber and uses the shared publisher
- `sessionManager.ts` — session CRUD and spectator counters
- `rateLimiter.ts` — token-bucket limiter for events
- `spectatorController.ts` — manages local sockets and redis subscriptions per session
- `websocketServer.ts` — WebSocketServer creation, JOIN flow, and publisher helpers
- `cleanup.ts` — cleanup helpers
- `shutdown.ts` — attaches graceful shutdown handlers

Load test script:
- `src/server/loadtest/loadtest.js` — simple connector to open many spectator connections

Security and operational notes:
- Validate and sanitize `sessionId` at join calls.
- Do not allow spectators to publish progress events.
- Rate limits ensure `PLAYER_PROGRESS` is throttled to ~100ms.
- Ensure `REDIS_URL` is set in production.

Run locally:
```
npm install
node ./dist/server/realtime/server.js   # after compiling TS or run via ts-node
node src/server/loadtest/loadtest.js 1000 50 10
```

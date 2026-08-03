# EchoKeys Complete Product Audit Report

**Date:** 2026-08-03  
**Scope:** Full repository inspection (source, tests, config, content, assets)  
**Method:** Evidence-only. No invented bugs or features.  
**Verification:** `npm test` (203+ tests) and `npm run check` (TypeScript project references) pass after fixes.

---

## 1. Executive summary

EchoKeys is a **production-capable Reddit Devvit typing race app**: React 19 client (three entrypoints), Express server on `@devvit/web`, Redis persistence, wiki backup for reinstall durability, server-authoritative scoring, and solid unit coverage for core game logic.

The codebase is **more mature than a typical vibe-coded game**: anti-cheat validation, race one-shot claim tokens, leaderboard wipe protection, tournament membership gates, and IME/paste handling are real and tested.

This audit still found **real issues** (Redis key growth, weekly live updates disabled on tournament posts, weekly `totalWordsTyped` pollution, missing a11y polish, broken ESLint toolchain, unused deps, UX dead-ends on open tournaments). Critical security paths (identity, score derivation) are sound for the Devvit model.

**Overall readiness:** Good for community playtest / limited production. Remaining work is hardening, observability, a11y/WCAG depth, and operational polish—not a rewrite.

---

## 2. Overall architecture (Phase 1 discovery)

### 2.1 Directory structure (inspected)

| Path | Role |
|------|------|
| `src/client/` | Splash, game, leaderboard React UIs + Vite multi-page build |
| `src/server/` | Express API, Redis services, knowledge base, schedulers |
| `src/shared/` | Types, ranking, anti-cheat, race excerpt, time keys |
| `tests/` | Vitest unit tests + Redis mock |
| `content/knowledge-base.txt` | Built-in race source pool |
| `assets/` | Icon, splash, loading media for Devvit |
| `dist/` | Build output (client HTML/JS, server `index.cjs`) |
| `devvit.json` | App config: entrypoints, permissions, menu, cron, triggers |

### 2.2 Technology stack (from `package.json`, configs, imports)

| Layer | Technology | Evidence |
|-------|------------|----------|
| Platform | Reddit Devvit 0.13.9 | `@devvit/web`, `@devvit/server`, `devvit.json` |
| Runtime | Node (Vite server target `node22`) | `src/server/vite.config.ts` |
| Frontend | React 19 + TypeScript | `src/client/**/*.tsx` |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"`, `@theme`) | `src/client/index.css` |
| Build | Vite 6 multi-page client + SSR CJS server | vite configs |
| Package manager | npm (`package-lock.json`) | lockfile present |
| HTTP | Express 5 | `src/server/index.ts` |
| Persistence | Devvit Redis | `permissions.redis`, `redis.get/set/del` |
| Realtime | Devvit Realtime channels | `permissions.realtime`, `realtime.send` |
| Auth | Reddit OAuth context (`context.username`, `reddit.getCurrentUsername`) | server `resolveUsername` |
| Hosting | Reddit-hosted Devvit app | platform model |
| Deployment | `devvit upload` / `devvit publish` | package scripts |
| Env | `.env.template` → `DEVVIT_SUBREDDIT` only | no external API keys |
| State (client) | React hooks local state | no Redux/Zustand |
| Networking | `fetch` to same-origin `/api/*` | client Apps |
| External services | None (no analytics SDKs, no third-party AI) | README + deps |

### 2.3 Application modes

1. **Free play hub** (`mode: play`) — random KB excerpt races  
2. **Challenge post** (`mode: challenge`) — fixed excerpt on post  
3. **Tournament** (`mode: tournament`) — shared excerpt, join list, standings  

### 2.4 Data model (Redis keys — from code)

| Key pattern | Purpose |
|-------------|---------|
| `challenge:{id}` | Race text + metadata |
| `race:{id}` / `race_open:{user}:{challenge}` | One-shot race clock sessions |
| `score:{id}` / `scores:idx:{user}` | Score history (capped 100 ids) |
| `player:{username}` | Profile + badges + PBs |
| `lb:{subId}:weekly:{YYYY-MM-DD}` | Live weekly board |
| `lb:{subId}:weekly:archive:{date}` | Archived weeks |
| `lb:{subId}:monthly:{YYYY-MM}` / yearly / alltime | Period boards |
| `tournament:{id}` / `:standings` / `tournaments:idx:{sub}` | Cups |
| `ratelimit:{action}:{identity}:{hour}` | Rate limits |
| `hub-post:{subId}` | Pinned play hub post id |
| Wiki `echokeys/leaderboard-backup` | Durable mirror outside Redis |

### 2.5 API surface (Express)

Public-ish: `/api/health`, `/api/me`, challenges, race start, score submit, leaderboards, profile, tournaments.  
Internal: menu posts, install/upgrade, weekly/monthly/yearly snapshots, daily wiki backup.

### 2.6 Realtime

Channel `leaderboard:{subredditId}` broadcasts weekly top board when eligible ranked scores change (throttled via in-memory last broadcast). Client polls every 8s as fallback (`useLiveLeaderboard`).

---

## 3. Build health (Phase 2)

| Finding | Severity | Evidence | Status |
|---------|----------|----------|--------|
| ESLint config imports packages not in `package.json` (`eslint`, `typescript-eslint`, `globals`, react plugins) | Medium | `eslint.config.js` vs deps | Documented; no `lint` script; active gates are `check` + `test` |
| ESLint targeted non-existent `src/devvit/**` | Low | eslint.config.js (fixed paths) | Fixed |
| Unused deps `concurrently`, `tsx` | Low | package.json scripts never call them | **Removed** |
| Steering docs outdated (`structure.md` mentions canvas/`main.ts`/`core/post.ts`) | Low | `.kiro/steering/*` vs actual tree | Documented debt |
| Build + tsc + tests healthy | — | 203 tests pass | OK |
| No Docker/CI config in repo | Medium | No `.github/workflows`, no Dockerfile | Debt |
| Prettier present (`.prettierrc`) without script/deps guarantee | Low | config exists; no prettier in package.json | Debt |

---

## 4. Code quality report (Phase 3)

**Strengths**

- Clear client/server/shared split  
- Shared scoring/anti-cheat used by server and client metrics  
- Wipe-safe leaderboard writes with merge modes  
- Wiki restore merges best-run (no empty overwrite)  
- Tests cover antiCheat, leaderboard, tournament, wiki, race excerpt  

**Smells / debt**

- Large UI files (`game/App.tsx`, `leaderboard/App.tsx`, `splash.tsx`) mix layout + data  
- CSS design tokens exist but are not componentized (no shared Button React components)  
- Inline styles still common alongside design tokens  
- `memoryCache` process-local (fine for Devvit isolate model; not multi-instance consistent)  
- Logging is `console.*` only (no structured logger)  

---

## 5. Discovered issues (master list)

### Critical

| ID | Issue | Root cause | Evidence | Files | Fix |
|----|-------|------------|----------|-------|-----|
| C1 | *(none remaining after inspection that cause crashes/data wipe)* | — | Leaderboard never deletes `lb:*`; install restores wiki | leaderboard.ts, wikiBackup.ts | N/A |

### High

| ID | Issue | Root cause | Evidence | Files | Implemented? |
|----|-------|------------|----------|-------|--------------|
| H1 | Rate-limit Redis keys never expire | `redis.set` without `expire` | `checkRateLimit` only set | `src/server/index.ts` | **Yes** — `setKeyExpiry(..., 2h)` |
| H2 | Abandoned race session keys never expire | Same | `createRaceSession` | `src/server/index.ts` | **Yes** — TTL ≈ race TTL + 60s |
| H3 | Weekly live leaderboard disabled on tournament posts | `liveEnabled && !hasTournament` | `leaderboard/App.tsx` | same | **Yes** — removed `!hasTournament` |

### Medium

| ID | Issue | Root cause | Evidence | Files | Implemented? |
|----|-------|------------|----------|-------|--------------|
| M1 | Weekly `totalWordsTyped` used lifetime profile total | `existing.totalWordsTyped = profile.totalWordsTyped` | `updateWeeklyLeaderboard` | leaderboard.ts | **Yes** — accumulate `score.wordsTyped` |
| M2 | Tournament join can overshoot `maxPlayers` under concurrency | Non-atomic RMW; Devvit Redis has no MULTI in use | `joinTournament` | tournament.ts | **Partial** — re-read + trim; still best-effort |
| M3 | Open tournament list not navigable | UI lists name only | splash.tsx | splash.tsx | **Yes** — Open button when `postId` set |
| M4 | `isPlaying` included `idle` → wrong shell/scroll lock risk | `phase === 'playing' \|\| phase === 'idle'` | game/App.tsx | game/App.tsx | **Yes** |
| M5 | Memory cache unbounded unique keys | Map only TTL-evicts on access | memoryCache.ts | memoryCache.ts | **Yes** — max 500 + periodic sweep |
| M6 | README said 50% only for ranking | Docs lag code (`MIN_LEADERBOARD_CORRECT_WORDS=20`) | README + antiCheat.ts | README | **Yes** |
| M7 | Accessibility incomplete (focus, reduced motion, landmarks) | Limited ARIA | CSS/UI | index.css, App files | **Partial** |
| M8 | No Redis TTL helper previously typed | RedisLike lacked `expire` | leaderboard types | leaderboard.ts | **Yes** |

### Low

| ID | Issue | Evidence | Status |
|----|-------|----------|--------|
| L1 | Unused `BACKUP_THROTTLE_KEY` const | wikiBackup.ts | Removed |
| L2 | ESLint not runnable | missing packages | Documented |
| L3 | Steering docs wrong structure | .kiro/steering | Debt |
| L4 | Cursor blink animation no reduced-motion | index.css | Fixed |
| L5 | No CI pipeline | repo root | Debt |
| L6 | Profile search / tabs keyboard a11y partial | leaderboard App | Partial tab roles |
| L7 | Challenge content cached 1h in memory after Redis | getChallenge | Acceptable |
| L8 | Bot telemetry advisory only | intentional | OK product choice |
| L9 | Word-level correctWords desync if extra spaces | countCorrectWords token alignment | Product/metric design — document |

### Security findings (Phase 12)

| Item | Assessment |
|------|------------|
| Username from client for scoring | **Rejected** — `resolveUsername()` from Reddit context only |
| Client WPM/accuracy for score | **Ignored** — server `validatePlayMetrics` from typed + race clock |
| Race replay | One-shot claim token + delete |
| Challenge IDOR across subs | communityId checked on get/start/submit |
| RaceId injection | Regex-validated id |
| Rate limits | Present; now TTL'd |
| XSS | React escapes; challenge text is plain text in spans |
| CSRF | Same-origin Devvit fetch model; no cookies of app origin |
| Tournament create | Moderator check |
| Paste | Client preventDefault; server speed floor |
| Remaining | Concurrent race claim best-effort (documented); bot detection log-only |

### Multiplayer / realtime (Phase 6)

This is **not** a shared-room simultaneous race engine. Model = async community races + live weekly board + tournament standings.  

Verified:

- Server clock for duration  
- No client-trusted winner  
- Tournament membership required  
- Realtime optional with poll fallback  

Unable to verify under real Reddit multi-instance load without playtest.

### Typing engine (Phase 7)

Verified in `useTypingGame` + `antiCheat`:

- Code-point correctness  
- Paste blocked / jump caps  
- IME composition jump allowance  
- Speed lock 7 wps / 1.5s  
- Server re-validates on submit  
- Time limit 4 minutes  

Edge: word tokenization vs character stream can diverge on multi-space typos (metric design).

### Database / durability (Phase 5)

| Concern | Status |
|---------|--------|
| Survive restart | Redis platform-backed; yes while installed |
| Survive uninstall | Wiki backup + restore on install/upgrade |
| Weekly history | Archive keys + index; wiki caps |
| Monthly/yearly | Snapshots + live merge for current period |
| All-time | `lb:{sub}:alltime` + profile merge |
| Player history | `scores:idx` last 100; scores JSON |
| Accidental wipe | Explicit refuse empty overwrite |
| Race/rate ephemeral growth | Fixed with expire |

---

## 6. Implemented fixes (this audit pass)

1. Redis `expire` helper + race session TTL + rate-limit TTL  
2. Weekly board `totalWordsTyped` period accumulation  
3. Memory cache max size + sweep  
4. Leaderboard live weekly on tournament posts  
5. Tournament join capacity re-check  
6. Game `isPlaying` only when `playing`  
7. Splash open-tournament Open navigation  
8. Focus-visible + prefers-reduced-motion  
9. Tablist/tab ARIA on leaderboard; aria-live stats  
10. Remove unused `concurrently`/`tsx`  
11. README ranking eligibility accuracy  
12. Regression tests (memory cache cap, tournament full, weekly words)

### Risks of fixes

- **Weekly words:** Existing current-week rows may still hold pre-fix inflated lifetime totals until week rolls; new increments are additive.  
- **Tournament re-read:** Under extreme concurrent joins, last-writer-wins can still drop a join (platform Redis limit); capacity overshoot is mitigated.  
- **expire:** Best-effort; mock Redis now implements expire for tests.

### Regression tests

- `tests/memoryCache.test.ts` — capacity eviction  
- `tests/tournament.test.ts` — maxPlayers reject  
- `tests/leaderboard.test.ts` — weekly words accumulate  
- Full suite: 203+ passing  

---

## 7. Performance (Phase 11)

| Area | Observation |
|------|-------------|
| Client render | Teleprompter maps every code point to a `<span>` — O(n) DOM for ~2k+ words; acceptable but heavy on low-end phones |
| Timer | 250ms interval updates WPM/score |
| Leaderboard poll | 8s + realtime |
| Bundle | Multi-page Vite splits splash/game/leaderboard |
| Redis | Many small JSON get/set; badge enrich concurrency 8 |
| Images | Minimal assets |

**Recommendations (not all implemented):** virtualize teleprompter window; reduce timer to 500ms; consider code-splitting speech path.

---

## 8. UI/UX & design system (Phases 8–10)

### Existing design system (CSS tokens in `index.css` `@theme`)

| Token type | Values (evidence) |
|------------|-------------------|
| Colors | bg `#0f0f0f`, surface, raised, accent `#e8ff3c`, green/red/blue… |
| Fonts | mono stack, UI system stack |
| Components | `.vsc-btn` variants, inputs, tabs, lb-row, splash/results/game shells |
| Spacing | mostly rem-based padding in components |
| Motion | blink, spin; now reduced-motion aware |

### UX audit notes

- Full-bleed dark game shell is cohesive  
- Teleprompter focus band is strong competitive UX  
- Mobile keyboard handling is sophisticated (`visualViewport`)  
- Splash tournament list previously dead-end — fixed Open  
- Results hierarchy clear (correct words primary)  
- Still missing: skeleton loaders as named components, toast system, empty-state illustration consistency  

### Responsiveness

- Mobile/desktop game layout switch at 768px  
- Safe-area padding present  
- Ultra-wide: content full width (no max-width reading column on teleprompter — intentional immersion)

---

## 9. Accessibility (Phase 13) — WCAG AA gap analysis

| Criterion | Status |
|-----------|--------|
| Keyboard focus visible | Improved (`:focus-visible`) |
| Reduced motion | Improved |
| Semantic landmarks | Partial (h1 on leaderboard; splash wordmark not h1) |
| Live regions | Stats aria-live; results limited |
| Color contrast | Accent on dark generally strong; dim `#444` labels may fail on small text |
| Screen reader race text | Capture textarea has label; colored spans are visual — SR may not get full excerpt structure |
| Touch targets | Buttons often 2.25rem — OK |

**Unable to verify** full screen-reader pass in Reddit WebView without device test.

---

## 10. Testing (Phase 14)

Present: unit tests for core logic (strong).  
Missing: e2e browser, load, chaos, network interruption, migration integration against real Redis.  

**Recommended next tests:** score submit path with mocked express; reconnect race expiry; wiki size trim.

---

## 11. Observability (Phase 15)

Present: structured-ish `console.log/warn/error` prefixes (`[API]`, `[Security]`, `[WikiBackup]`), `/api/health`.  
Missing: metrics, tracing, crash reporting, dashboards, alerts.

---

## 12. Remaining technical debt

1. Install ESLint toolchain or delete config to avoid false security  
2. GitHub Actions: test + check on PR  
3. Extract design-system React components  
4. Structured logging JSON  
5. Teleprompter virtualization  
6. Steering docs update  
7. E2E playtest automation  
8. Challenge garbage collection policy (challenges never expire — intentional durability vs Redis size)  
9. Consider atomic join via Redis list patterns if API allows  

---

## 13. Prioritized implementation roadmap

### Phase 1 — Critical (done / N/A)

- [x] No wipe paths found on leaderboard keys  
- [x] Ephemeral Redis TTL (rate limits, races)  
- [x] Server-authoritative scoring (already present)

### Phase 2 — Gameplay correctness & boards

- [x] Weekly live on tournament posts  
- [x] Weekly words period scope  
- [x] Tournament capacity hardening  
- [ ] Optional: challenge expiry / max challenge count  
- [ ] Optional: season history UI (yearly exists; “season” product concept not separate)

### Phase 3 — Performance & scale

- [ ] Virtualize teleprompter DOM  
- [ ] Measure bundle size budgets in CI  
- [ ] Cache wiki backup CPU path  

### Phase 4 — UI/UX & a11y

- [x] Focus + reduced motion  
- [x] Open tournament navigation  
- [ ] Contrast audit on `.stat-lbl` / dim text  
- [ ] Landmark/header consistency on all screens  
- [ ] Skeleton loaders  

### Phase 5 — Maintainability

- [ ] CI  
- [ ] ESLint install or remove  
- [ ] Structured logs  
- [ ] Update `.kiro/steering` docs  

---

## 14. Files touched in this audit implementation

- `src/server/index.ts`  
- `src/server/services/leaderboard.ts`  
- `src/server/services/memoryCache.ts`  
- `src/server/services/tournament.ts`  
- `src/server/services/wikiBackup.ts`  
- `src/client/game/App.tsx`  
- `src/client/leaderboard/App.tsx`  
- `src/client/splash/splash.tsx`  
- `src/client/index.css`  
- `package.json`  
- `eslint.config.js`  
- `README.md`  
- `tests/helpers/redisMock.ts`  
- `tests/memoryCache.test.ts`  
- `tests/leaderboard.test.ts`  
- `tests/tournament.test.ts`  
- `docs/AUDIT-REPORT.md` (this file)

---

## 15. Statements of insufficient evidence

> Unable to verify from the current code: real-world Reddit WebView keyboard quirks across all iOS/Android versions; multi-isolate Redis consistency under production concurrency; wiki restore on communities with wiki disabled; actual production Redis size limits per install; end-user screen-reader experience inside Reddit’s iframe/WebView.

---

*End of audit report.*

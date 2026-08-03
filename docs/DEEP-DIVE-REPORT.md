# EchoKeys Engineering Deep Dive Report

**Date:** 2026-08-03  
**Method:** Re-verify prior audit from source + expand coverage. No assumed bugs.  
**Gates:** `npm test` **212 passed**, `npm run check` clean.

Related: `docs/AUDIT-REPORT.md`, `docs/REDIS-KEY-INVENTORY.md`.

---

## 1. Prior audit verification

| ID | Claim | Re-verified in code? | Regression? | Side effects |
|----|-------|----------------------|-------------|--------------|
| H1 Rate-limit TTL | `setKeyExpiry(redis, key, 2h)` after set | **Yes** — `src/server/index.ts` | None | Requires Devvit `expire`; no-op if missing |
| H2 Race session TTL | expire on `race:` + `race_open:` | **Yes** | None | Abandoned races auto-drop |
| H3 Live weekly on tournament posts | `liveEnabled = weekly && weekOffset===0` | **Yes** | None | Live still off when viewing past weeks (correct) |
| M1 Weekly words period-scoped | write path accumulates `score.wordsTyped` | **Write: Yes / Read: WAS BROKEN** | **Found** | `enrichPlayerBadges` overwrote with profile lifetime on every API read — **fixed this pass** |
| M2 Tournament capacity | re-read + trim after join | **Yes (best-effort)** | None | Last-writer-wins can still drop a join under extreme concurrency — platform limit |
| M3 Open tournament Open button | splash maps `postId` → navigate | **Yes** | None | URL shape is best-effort; Reddit often redirects `comments/{id}` |
| M4 `isPlaying` only `playing` | game App | **Yes** | None | Idle no longer locks scroll |
| M5 Memory cache cap 500 | memoryCache | **Yes** | None | Oldest eviction under pressure |
| M6 README ranking eligibility | 20+ words or 50% | **Yes** | None | — |
| M7 A11y partial | focus-visible, reduced-motion | **Yes**, extended this pass | None | Contrast tokens improved |
| M8 `setKeyExpiry` helper | leaderboard.ts | **Yes** + unit test | None | — |
| L1 Dead throttle const | removed | **Yes** | None | — |
| Unused deps removed | package.json | **Yes** | None | — |

**Hidden side effect of M1 fix (previous pass):**  
Period boards were written correctly, but **`enrichPlayerBadges` always replaced `totalWordsTyped` with `profile.totalWordsTyped`**, so every `/api/leaderboard/*` response reintroduced lifetime totals. UI rows do not currently display that field, so player-visible impact was low; API/export/realtime payloads were still wrong.

---

## 2. Newly discovered issues

| ID | Severity | Issue | Root cause | Evidence | Fix |
|----|----------|-------|------------|----------|-----|
| N1 | **High** | Leaderboard API re-pollutes period word totals | `enrichPlayerBadges` overwrote field | `leaderboard.ts` L661 (pre-fix) | **Implemented** — badges only |
| N2 | **High** | `maxPlayers: NaN` makes tournaments never full | `typeof NaN === 'number'`; `Math.min(NaN,200)=NaN` | `createTournament` + API body | **Implemented** — finite check + default |
| N3 | **Medium** | After throttle unlock, `lastLen` used UTF-16 `.length` | `lockInput` vs code-point tracking elsewhere | `useTypingGame.ts` | **Implemented** — `codePoints(...).length` |
| N4 | **Medium** | Throttle `setTimeout` not cleared on unmount | missing cleanup | `useTypingGame.ts` | **Implemented** — `throttleTimer` ref |
| N5 | **Medium** | Label contrast fail WCAG AA | `--color-dim:#444`, `--color-muted:#666` on `#0f0f0f` | `index.css` | **Implemented** — `#757575` / `#8a8a8a` |
| N6 | **Low** | Tournament GET/join no communityId guard | assume install isolation | `index.ts` | **Implemented** — 404 mismatch |
| N7 | **Low** | Missing `theme-color` / `color-scheme` / safe viewport | bare HTML shells | `*.html` | **Implemented** |
| N8 | **Low** | Leaderboard errors had no Retry | error-only UI | `leaderboard/App.tsx` | **Implemented** |
| N9 | **Low** | Splash title not semantic heading | `div` wordmark | splash | **Implemented** — `h1` |
| N10 | **Info** | No CI workflow | repo | **Implemented** — `.github/workflows/ci.yml` |
| N11 | **Info** | Challenge keys unbounded | intentional durability | redis inventory | Documented debt |
| N12 | **Info** | Concurrent tournament join not fully atomic | no MULTI | documented | Best-effort only |
| N13 | **Info** | Word-token ranking vs multi-space typos | product metric | antiCheat | Document only |

### Typing engine validation (code-level)

| Scenario | Server | Client | Notes |
|----------|--------|--------|-------|
| Slow typing | accepts if ≥1s | WPM from elapsed | tested |
| Fast typing | rejects >7 wps | lock 1.5s | tested |
| Backspace | final buffer only | buffer rewrite | tested (final buffer) |
| IME | N/A | composition jump cap | present |
| Unicode/emoji | codePoints | codePoints + span map | tested |
| Paste | speed/sanitize | preventDefault + jump | present |
| Refresh mid-race | session until TTL | loses local input | by design; new start replaces open race |
| Interrupted submit | race kept on network err | retry upload | present |

**Unable to verify:** real iOS/Android Reddit WebView keyboard quirks without device playtest.

### Security re-check

| Control | Status |
|---------|--------|
| Username trust | Server context only |
| Score trust | typed + race clock |
| Race replay | claim token |
| Rate limits | hour bucket + TTL |
| Challenge IDOR | communityId check |
| Tournament IDOR | communityId check (new) |
| NaN maxPlayers | closed |
| Botting | advisory logs only |

### Performance (measured where possible)

| Metric | Evidence |
|--------|----------|
| Unit suite | ~1.5s for 212 tests |
| Client chunks (dist sample) | React ~192KB, app chunks ~13–27KB entry, CSS ~28KB |
| Teleprompter | O(n) spans for full excerpt — main client CPU risk |
| Leaderboard poll | 8s + realtime |
| Redis | many small JSON keys; badge enrich concurrency 8 |

**Unable to verify:** production Redis latency / multi-isolate CPU without Reddit playtest metrics.

---

## 3. Implemented this pass

1. `enrichPlayerBadges` preserves board-scoped `totalWordsTyped`  
2. Finite `maxPlayers` / NaN → default capacity  
3. Typing throttle: code-point `lastLen` + timeout cleanup  
4. Contrast tokens for muted/dim  
5. Tournament communityId on GET/join  
6. HTML theme-color, color-scheme, viewport-fit  
7. Leaderboard error Retry; splash/results semantics  
8. CI workflow  
9. Redis inventory doc  
10. Regression + stress tests (+7 tests → 212 total)

### Files touched

- `src/server/services/leaderboard.ts`  
- `src/server/services/tournament.ts`  
- `src/server/index.ts`  
- `src/client/hooks/useTypingGame.ts`  
- `src/client/index.css`  
- `src/client/game.html`, `splash.html`, `leaderboard.html`  
- `src/client/splash/splash.tsx`, `leaderboard/App.tsx`, `game/App.tsx`  
- `tests/leaderboard.test.ts`, `tournament.test.ts`, `antiCheat.test.ts`  
- `.github/workflows/ci.yml`  
- `docs/REDIS-KEY-INVENTORY.md`, `docs/DEEP-DIVE-REPORT.md`

---

## 4. UI/UX review summary

| Screen | Assessment | Change |
|--------|------------|--------|
| Splash | Clear hierarchy; tournaments now openable | h1, margins |
| Free play | Strong CTA, pool status | unchanged identity |
| Race teleprompter | Best-in-class focus band; competitive | no redesign needed |
| Results | Correct-words first | semantic h1 |
| Leaderboard | Live chip, tabs, cards/rows | Retry on error |
| Profile | Search + stats grid | OK |

Identity preserved: dark shell, acid accent `#e8ff3c`, mono metrics, flat borders.

---

## 5. Accessibility

| Item | Status |
|------|--------|
| Focus visible | Yes |
| Reduced motion | Yes |
| Contrast labels | Improved (AA-oriented greys) |
| Landmarks/headings | Splash + results + leaderboard improved |
| ARIA tabs | Leaderboard tablist |
| Live regions | Game stats `aria-live` |
| Screen reader full race text | Partial — capture field labeled; visual spans not dual-announced |

**Unable to verify:** VoiceOver/TalkBack inside Reddit WebView.

---

## 6. Remaining technical debt

1. Teleprompter virtualization for long excerpts  
2. Challenge key GC policy  
3. ESLint packages not installed (config is dormant)  
4. E2E / load / chaos tests  
5. Structured logging / metrics  
6. Steering docs still outdated  
7. Tournament join not fully atomic without Redis transactions  
8. Realtime only weekly top board (not tournament standings live)  

---

## 7. Prioritized roadmap

### P0 — Done this deep dive
- Period board word totals on read path  
- NaN tournament capacity  
- Throttle code-point / leak fix  
- Contrast + CI  

### P1 — Next shipping window
- Virtualize teleprompter DOM  
- Live tournament standings channel (optional)  
- Challenge retention policy  

### P2 — Hardening
- ESLint toolchain or delete config  
- E2E smoke against playtest sub  
- Structured logs + error rate alerts  

### P3 — Polish
- Skeleton loaders as components  
- Contrast audit tool in CI  
- Steering doc rewrite  

---

## 8. Explicit inability statements

> Unable to verify from the current code: multi-isolate Redis races under production Devvit load; wiki restore when subreddit wiki is disabled; real device keyboard/IME in Reddit apps; full WCAG audit with assistive tech; absolute bundle size regression vs prior releases without stored baselines.

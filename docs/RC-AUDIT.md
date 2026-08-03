# Echokeys Release Candidate Audit

**Date:** 2026-08-03  
**Scope:** Final cleanup only — no features, no architecture redesign  
**Gates:** `npm test` · `npm run check` · `npm run build`

---

## 1. Repository tree (before this RC pass)

```
echokeys/
  .cursor/ .github/ .grok/ .kiro/ .vscode/
  assets/ content/ dist/ docs/ node_modules/
  src/{client,server,shared}/
  tests/
  package.json, devvit.json, README.md, …
```

Already removed in prior cleanup (still deleted in working tree):

- `tools/` (unused `tsconfig-base.json`)
- `eslint.config.js` (non-runnable; no ESLint packages)

---

## 2. Repository tree (after RC pass)

Same intentional layout. No new folders except `docs/DEPLOY.md` (documentation only).  
`tools/` and `eslint.config.js` remain gone.

```
echokeys/
  .cursor/ .github/ .grok/ .kiro/ .vscode/
  assets/ content/ dist/ docs/ node_modules/
  src/client/  src/server/  src/shared/
  tests/
  devvit.json  package.json  README.md  tsconfig.json
  LICENSE  .env.template  .prettierrc  …
```

---

## 3. Files / folders removed this RC pass

| Item | Action | Evidence |
|------|--------|----------|
| `weekStartWithOffsetLocal` | Removed (dead duplicate) | Identical to `weekStartWithOffset` in `time.ts` |
| Default `React` import in leaderboard App | Removed | No `React.` usage |
| — | No additional folders deleted | No empty/duplicate/backup dirs found |

**Not removed (intentionally kept):**

| Item | Why |
|------|-----|
| `assets/*` | Devvit `media.dir` |
| `docs/*` audits | Historical + operational value |
| Server `console.*` | Prefixed ops logging, not debug noise |
| `@devvit/server` | Platform dependency pin |
| `.prettierrc` | Editor formatting |
| `CareerStats` type | Documents profile.career shape |

---

## 4. Dependencies removed

**None this pass.** `package.json` already lean; `npm ls` clean of prior `concurrently`/`tsx`.

---

## 5. Dead code removed

- Duplicate week-offset helper in `leaderboard.ts`
- Unused default React import in `leaderboard/App.tsx`
- Unused `weekStartKey` import in `permanence.test.ts`
- Log prefix consistency on game submit errors

---

## 6. Documentation updated

| Doc | Change |
|-----|--------|
| `README.md` | Freezes, career, history/health APIs, deploy pointer |
| `docs/DEPLOY.md` | **New** deploy/smoke/troubleshooting |
| `docs/REDIS-KEY-INVENTORY.md` | Alignment note |
| `.github/copilot-instructions.md` | Replaced KeyScripture template with Echokeys |
| `.kiro/steering/structure.md` | Matches real tree |
| `.kiro/steering/tech.md` | Matches stack/commands |
| `.kiro/steering/product.md` | Matches product |
| `docs/RC-AUDIT.md` | This report |

---

## 7. Performance

| Item | Result |
|------|--------|
| Duplicate week helper | Eliminated (clarity only; no hot path change) |
| Polling / Redis | **No change** — live leaderboard 8s poll + realtime already intentional |
| Client memoization | **No change** — no proven wasteful remounts without profiling |

Unable to verify runtime Reddit WebView FPS/latency without playtest.

---

## 8. UI polish

| Item | Result |
|------|--------|
| Redesign | **Not done** (out of scope) |
| Focus / reduced motion | Already present from prior pass |
| Error log label | `[Game]` prefix for submit errors |

No layout/spacing redesign performed.

---

## 9–10. Build & test verification

| Command | Result |
|---------|--------|
| `npm test` | **224 passed** (9 files) |
| `npm run check` | **Clean** |
| `npm run build` | **Success** (client + server) |

---

## 11. Remaining technical debt (genuine future work)

1. Score history still capped at **100** per player (career counters permanent).
2. Full multi-million race transcript store needs external cold storage (documented).
3. Leaderboard UI does not yet browse frozen history APIs.
4. No ESLint in package.json (quality gates: test + check + CI).
5. Prettier not a direct dependency (optional editor-only).
6. Unable to verify full WCAG / device matrix without hardware playtest.

---

## 12. Release readiness checklist

- [x] Builds successfully  
- [x] Tests pass  
- [x] No destructive data paths introduced  
- [x] Permanence freezes preserved by design  
- [x] Wiki backup path intact  
- [x] Docs match implementation  
- [x] No TODO/FIXME/HACK in source  
- [x] No unused tools/eslint leftovers on disk  
- [ ] Playtest smoke on `r/echokeys_dev` (human / Reddit env)  
- [ ] First production install integrity + hub post check  

**RC recommendation:** Ready for playtest/production deploy after human smoke on Reddit. Automated gates are green.

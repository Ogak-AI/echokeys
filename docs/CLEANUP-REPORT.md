# EchoKeys Repository Cleanup Report

**Date:** 2026-08-03  
**Method:** Full inventory + dependency graph; delete only proven-unused  
**Verification:** `npm test` 212 passed · `npm run check` clean · `npm run build` success

---

## 1. Repository tree BEFORE cleanup

```
echokeys/
├── .cursor/                 # Cursor IDE rules / MCP
├── .git/
├── .github/                 # CI + copilot instructions
│   └── workflows/ci.yml
├── .grok/                   # Grok skill(s)
├── .kiro/                   # Kiro hooks + steering docs
├── .vscode/                 # Editor settings
├── assets/                  # Devvit media (icon, splash, loading)
├── content/                 # knowledge-base.txt (race pool)
├── dist/                    # Generated build output (gitignored)
├── docs/                    # Audit / Redis / deep-dive docs
├── node_modules/
├── src/
│   ├── client/              # React multi-page UI + Vite
│   ├── server/              # Express + Devvit API
│   └── shared/              # Types + utils
├── tests/                   # Vitest
├── tools/                   # tsconfig-base.json only
├── devvit.json
├── eslint.config.js         # Broken (packages not installed)
├── package.json
├── package-lock.json
├── README.md
├── LICENSE
├── tsconfig.json
├── .prettierrc
├── .env.template
└── …
```

### Folder categories (Phase 1)

| Folder | Category | Evidence |
|--------|----------|----------|
| `src/client` | Core / UI | Vite entrypoints, React apps |
| `src/server` | Core / Backend | Express, Devvit server |
| `src/shared` | Shared library | Imported by client + server + tests |
| `tests` | Tests | Vitest suite |
| `content` | Core content | `?raw` import in knowledgeBase.ts |
| `assets` | Assets / Devvit media | `devvit.json` → `media.dir: "assets"` |
| `docs` | Documentation | Markdown reports |
| `dist` | Build output / Generated | Vite outDir; gitignored |
| `tools` | Legacy / Unknown config | **No extends/imports** |
| `.github` | Configuration / CI | workflows + copilot |
| `.vscode` / `.cursor` / `.kiro` / `.grok` | Tooling | Editor/agent config |
| `node_modules` | Generated deps | npm |
| `eslint.config.js` | Configuration (dead) | Imports missing packages |

---

## 2. Dependency graph (source of truth)

```
devvit.json
  → dist/client (splash|game|leaderboard.html)
  → dist/server/index.cjs
  → assets/*

package.json scripts
  → src/client/vite → dist/client
  → src/server/vite → dist/server
  → tsc --build → src/{client,server,shared}
  → vitest → tests/* → src/*

src/client/*.{html,tsx}
  → hooks, shims, shared, index.css, react, @devvit/web/client (shim)

src/server/index.ts
  → services/*, knowledgeBase, shared, express, @devvit/web/server

src/server/knowledgeBase.ts
  → content/knowledge-base.txt?raw

src/shared/*
  → used by client, server, tests

tests/*
  → src/** (unit coverage)
```

**No duplicate app trees** (`components-old`, `utils2`, `backup`, etc.) found.

---

## 3. Detected unnecessary items (Phase 2)

| Item | Why unused | Evidence | Action |
|------|------------|----------|--------|
| `tools/tsconfig-base.json` | No tsconfig `extends` it | All `src/*/tsconfig.json` are standalone | **Deleted** |
| `tools/` | Only contained that file | Empty after delete | **Deleted** |
| `eslint.config.js` | ESLint packages not in package.json; no `lint` script; packages not in node_modules | package.json + `Test-Path node_modules/eslint` = false | **Deleted** |
| Local `dist/` | Generated, gitignored | `.gitignore` has `dist` | **Deleted locally** (rebuild regenerates) |
| `format:check` script | Prettier not a project dep; script used `\|\| exit 0` | package.json; prettier only transitive via `@devvit/cli` | **Removed script** |
| Dead exports | Zero imports/tests | grep across repo | **Removed** (see files) |
| Dead CSS (table LB) | Classes not in any `.tsx` | grep `lb-table`, `lb-cards`, `lb-shell`, `lb-hero`, `editor-content` | **Removed** |
| Stale lock entries `concurrently`, `tsx` | Already removed from package.json earlier | npm install dropped 13 packages | **Lock synced** |

### Intentionally NOT deleted

| Item | Why kept |
|------|----------|
| `assets/*` | Required by Devvit `media.dir`; platform media even without code string refs |
| `content/knowledge-base.txt` | Built into server bundle |
| `@devvit/server` | Direct pin; required by `@devvit/web` dependency tree |
| `docs/` | Documentation |
| `.kiro/`, `.cursor/`, `.grok/`, `.vscode/` | Tooling; not runtime but used by humans/agents |
| `.github/copilot-instructions.md` | AI guidance (stale KeyScripture text noted as debt, not unused) |
| `.prettierrc` | Editor may use Prettier extension; harmless |
| `react` as devDependency | Correct for Vite client bundle; not “unused” |
| Shared types / ranking helpers | All referenced |

### Structure decision (Phase 5)

**Did not force** `components/pages/public` layout. Existing `src/{client,server,shared}` + Vite multi-page + Devvit entrypoints is the correct architecture for this app. Moving would risk Devvit/Vite path breakage with no functional gain.

---

## 4. Tree AFTER cleanup

```
echokeys/
├── .cursor/
├── .git/
├── .github/
│   └── workflows/ci.yml
├── .grok/
├── .kiro/
├── .vscode/
├── assets/
├── content/
├── dist/                    # recreated by build
├── docs/
├── node_modules/
├── src/
│   ├── client/
│   ├── server/
│   └── shared/
├── tests/
├── devvit.json
├── package.json
├── package-lock.json
├── README.md
├── LICENSE
├── tsconfig.json
├── .prettierrc
└── .env.template
```

**Removed folders:** `tools/`  
**Removed top-level files:** `eslint.config.js`

---

## 5. Files / symbols removed

### Folders

| Path | Why |
|------|-----|
| `tools/` | Only unreferenced `tsconfig-base.json` |

### Files

| Path | Why |
|------|-----|
| `tools/tsconfig-base.json` | Never extended/imported |
| `eslint.config.js` | Non-runnable; missing packages; no script |
| `dist/**` (local) | Generated artifact; gitignored |

### Dead code symbols

| Symbol | File | Why |
|--------|------|-----|
| `WPM_TOLERANCE` | `antiCheat.ts` | Zero references |
| `sanitizePrompt` | `antiCheat.ts` | Zero references |
| `leaderboardIneligibleReason` | `antiCheat.ts` | Zero references (UI hardcodes message) |
| `knowledgeBaseWordCount` | `knowledgeBase.ts` | Zero references |

### Dead CSS

| Selectors | Why |
|-----------|-----|
| `.lb-table*`, `.lb-cards`, `.lb-card*`, `.lb-col-*`, `.lb-rank` | Legacy table UI; App uses `.lb-row` |
| `.lb-shell`, `.lb-hero*` | Unused shells |
| `.editor-content` | Never applied in TSX |

### package.json scripts

| Script | Why removed |
|--------|-------------|
| `format:check` | No direct prettier dep; always exited 0 |

### Dependencies

| Package | Action |
|---------|--------|
| `concurrently`, `tsx` | Already absent from package.json; lockfile pruned via `npm install` (13 packages removed) |
| `@devvit/server` | **Kept** — platform dependency |

---

## 6. Verification (Phase 8)

| Check | Result |
|-------|--------|
| `npm test` | **212 passed** |
| `npm run check` | **clean** |
| `npm run build` | **success** (client + server) |
| Broken imports | None |
| Devvit entrypoints | Still splash/game/leaderboard.html |
| Assets / content | Intact |

---

## 7. Remaining intentional keep / debt

1. **`.github/copilot-instructions.md`** — still describes “KeyScripture” template; update when convenient (not deleted: documentation).  
2. **`.kiro/steering/structure.md`** — outdated structure narrative; keep as steering.  
3. **`.prettierrc` without direct prettier dep** — optional editor config.  
4. **No ESLint** after this cleanup — quality gates are `check` + `test` + CI. Re-add ESLint only with packages + a `lint` script.  
5. **CSS still large** — remaining classes are referenced; further CSS trim needs per-class proof.

---

## 8. Summary

| Metric | Count |
|--------|-------|
| Folders removed | 1 (`tools/`) + local `dist/` regenerated |
| Config files removed | 1 (`eslint.config.js`) |
| Dead exports removed | 4 |
| Dead CSS blocks removed | legacy table/hero/editor-content |
| Direct npm deps removed this pass | 0 (already cleaned; lock synced) |
| Breaking changes | **None** |

Cleanup prioritized correctness: nothing required by Devvit, Vite, TypeScript, npm, tests, or CI was removed.

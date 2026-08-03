# EchoKeys Enterprise Data Architecture & Long-Term Persistence

**Status:** Architecture + Layer-2 permanence foundations implemented  
**Platform constraint:** Reddit Devvit (Redis + wiki). No external SQL DB in-process.  
**Principle:** Never destroy production data. Additive migrations only.

---

## 1. Current architecture review

### What exists today (verified in code)

| Store | Role | Durability |
|-------|------|------------|
| Devvit Redis | Primary live + historical JSON documents | Cleared on **app uninstall** |
| Subreddit wiki (`echokeys/leaderboard-backup`) | Mirror of ranks/profiles | Survives uninstall; size-capped |
| Process memory cache | Read TTL cache | Ephemeral |
| Scheduler crons | Weekly/monthly/yearly snapshots + daily wiki backup | Platform-scheduled |

### Strengths already present

- Wipe protection on leaderboard writes (`persistLeaderboardEntries`)
- Wiki restore/merge on install/upgrade
- Weekly archive keys never deleted on snapshot
- Race sessions TTL’d (Layer 1)
- Server-authoritative scores

### Gaps vs multi-year competitive platform

| Gap | Risk |
|-----|------|
| Archives rewritable via replace mode | Historical winners could change if source re-merged differently |
| Player score history capped at 100 | Career match list incomplete |
| No frozen document model | No checksum / immutability seal |
| No schema migration log | Hard to prove upgrade safety |
| Wiki size trim drops old archives | Long-term history incomplete off-Redis |
| Tournament standings not archived on close | Cup winners not permanently sealed |
| Platform Redis scale | Millions of full race blobs may exceed install limits |

### Honest platform ceiling

Devvit Redis is **per-subreddit installation**, not a global multi-tenant warehouse.  
**100k players / 10M submissions per community** may require:

1. Continued Redis document design with aggressive indexing + archival  
2. Wiki (or future external object store) for cold history  
3. Optionally a future off-platform warehouse for analytics (Layer 3)

This design makes Layer 2 correct and immutable **within Redis + wiki**, and defines the path to external cold storage without rewriting gameplay.

---

## 2. New architecture (three layers)

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (React webviews)                 │
│  splash / game / leaderboard — never authoritative for rank │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS /api/*
┌───────────────────────────▼─────────────────────────────────┐
│                   APPLICATION SERVER                        │
│  Express on Devvit · validation · anti-cheat · auth context │
└───────┬─────────────────────┬───────────────────┬───────────┘
        │                     │                   │
   ┌────▼────┐          ┌─────▼─────┐       ┌─────▼─────┐
   │ Layer 1 │          │  Layer 2  │       │  Layer 3  │
   │  LIVE   │          │ PERMANENT │       │ ANALYTICS │
   └────┬────┘          └─────┬─────┘       └─────┬─────┘
        │                     │                   │
   race:*, ratelimit:*,   player:*, score:*,   regenerable
   memoryCache,           lb:*, perm:snap:*,   summaries /
   realtime channels      perm:meta:*,         dashboards
                          wiki mirror
```

### Layer 1 — Live gameplay (may expire)

| Data | Key / store | TTL |
|------|-------------|-----|
| Race session | `race:{id}`, `race_open:*` | ~6 min |
| Rate limits | `ratelimit:*` | 2h |
| Memory cache | process Map | seconds–hours |
| Realtime broadcast state | in-memory last payload | 60s |

### Layer 2 — Permanent (never expire by policy)

| Entity | Storage |
|--------|---------|
| Player profile + career | `player:{username}` |
| Score documents | `score:{id}` + `scores:idx:{user}` |
| Live period boards | `lb:{sub}:weekly|monthly|yearly|alltime` |
| **Frozen snapshots** | `perm:snap:{sub}:{kind}:{period}` |
| Snapshot indexes | `perm:snapidx:{sub}:{kind}` |
| Schema + migrations | `perm:meta:{sub}` |
| Tournaments + standings | `tournament:*` |
| Challenges | `challenge:{id}` |
| Wiki cold backup | `echokeys/leaderboard-backup` |

### Layer 3 — Analytics (regenerable)

Derived from Layer 2 freezes + scores. May be recomputed. Not yet a separate store; future: daily rollups in `analytics:*` keys or external BI.

---

## 3. Data model (logical entities)

```
Player
  id = username (lowercase Reddit name)
  profile fields + career counters
  → has many Score
  → appears on many LeaderboardEntry
  → has many Badge (embedded)

Score (Match / Race result)
  id, username, challengeId, metrics, playedAt, communityId
  append-only document

Challenge
  id, content, domain, communityId, createdAt

Leaderboard (live period)
  keyed by community + period
  mutable during open period; never empty-wiped

FrozenSnapshot (immutable history)
  kind, periodKey, entries[], checksum, frozenAt, frozen=true
  write-once

Tournament
  id, participants, endsAt, status
  → standings key
  → on close → FrozenSnapshot kind=tournament

PermanenceMeta
  schemaVersion, migrations[]

WikiBackup v1
  alltime, weekly, archives, profiles (cold mirror)
```

### Mapping to requested entities

| Requested | Implementation |
|-----------|----------------|
| Players | `player:{username}` + career |
| Matches / MatchParticipants | `score:{id}` (single-player race model) |
| Leaderboards | `lb:*` live |
| LeaderboardSnapshots | `perm:snap:*` frozen |
| Weekly/Monthly/Year Seasons | period keys + freezes |
| Achievements | badges[] on profile |
| PlayerStatistics / History | profile + scores idx + freezes |
| TournamentHistory | freeze kind=tournament |
| AuditLog / MigrationHistory | `perm:meta` migrations; expand later |
| VersionHistory | `schemaVersion` on meta + freezes |

---

## 4. Entity relationship (text ERD)

```
[Player] 1──* [Score]
[Player] 1──* [Badge*]          (*embedded array)
[Challenge] 1──* [Score]
[Community] 1──* [LeaderboardLive]
[Community] 1──* [FrozenSnapshot]
[Tournament] 1──1 [Standings]
[Tournament] 1──0..1 [FrozenSnapshot kind=tournament]
[Community] 1──1 [PermanenceMeta]
[Community] 1──1 [WikiBackup]   (external wiki page)
```

---

## 5. Immutable history rules

1. **Open period** (`lb:…:weekly:{current}`): mutable, best-run merge.  
2. **On period end**: copy to archive key + **`freezeSnapshot`**.  
3. **Frozen document**: `frozen:true` + checksum.  
4. **Re-run cron**: identical content → idempotent; different content → **refuse**.  
5. **Tournament close**: freeze standings; award career tournament win once.  
6. **Never `DEL` permanent keys** in app code.

---

## 6. Migration strategy

| Rule | Detail |
|------|--------|
| Direction | Additive only |
| Forbidden | DROP, TRUNCATE, delete history keys |
| Process | `ensurePermanenceMeta` bumps schema, appends `MigrationRecord` |
| Validation | `verifyPermanenceIntegrity` after upgrade |
| Rollback | Keep old keys; new code must read old shapes (optional fields) |
| Version | `PERMANENCE_SCHEMA_VERSION` (currently **2**) |

---

## 7. Backup strategy

| Tier | Mechanism | Frequency |
|------|-----------|-----------|
| Hot | Redis live keys | continuous |
| Warm freeze | `perm:snap:*` | weekly/monthly/yearly/tournament close |
| Cold | Wiki mirror | daily + after scores (throttled) + after snapshots |
| Ops | Export via wiki page / future S3 | as needed |

### Incremental

Score submits update player/score/lb keys; freeze captures closed periods; wiki throttled full export.

### Full

Daily `leaderboard-backup` job + snapshot-triggered wiki writes.

### Checksums

`checksumEntries` (FNV-1a) on every frozen snapshot; verified in integrity report.

---

## 8. Restore strategy

1. On install/upgrade: `syncLeaderboardWithWiki` (merge, never empty overwrite).  
2. `bootstrapPermanence` ensures meta + integrity log.  
3. Live play continues; freezes remain if Redis retained, or rebuild freezes from restored archives when re-snapshotting (idempotent).  
4. If wiki missing: ranks only as complete as Redis.

---

## 9. Disaster recovery

| Scenario | Response |
|----------|----------|
| App uninstall | Redis wiped → wiki restore on reinstall |
| Bad deploy | Integrity `?integrity=1` → 503 degraded; freezes refuse overwrite |
| Partial corruption | Checksum mismatch flagged; freeze original still preferred over rewrite |
| Wiki disabled | Redis-only until wiki re-enabled; document for mods |
| Total wiki+redis loss | Unrecoverable without external backup — risk accepted until off-platform cold store |

**RPO:** up to throttle window for wiki (5 min after score) or 24h for daily job.  
**RTO:** reinstall + restore path (minutes, platform-dependent).

---

## 10. Data retention policy

| Data | Retention |
|------|-----------|
| Frozen snapshots | **Indefinite** (index cap 2000 periods ≈ decades of weeks) |
| Live weekly | Current + unarchived keys retained (no delete policy) |
| Player scores | Last **100** ids per player (document limit; career counters permanent) |
| Race sessions | TTL ~ race window |
| Rate limits | 2h |
| Challenges | Indefinite (growth risk — monitor) |

**Score cap note:** full match-level history beyond 100 requires either raising the cap carefully or external archive. Career stats remain complete via counters.

---

## 11. Deployment safety checklist

- [ ] `npm test` / `npm run check` / `npm run build` green  
- [ ] No destructive migration scripts  
- [ ] Playtest: `GET /api/health?integrity=1` → `ok`  
- [ ] Confirm wiki backup page exists post-deploy  
- [ ] Confirm frozen periods list after a snapshot job  
- [ ] Abort if integrity returns **error** severity on known-good install  
- [ ] Never run ad-hoc `DEL lb:*` or `DEL perm:*`  

---

## 12. Scalability plan

| Scale | Strategy |
|-------|----------|
| ≤10k players / community | Current Redis document model OK |
| 10k–100k | Cap board sizes (already 25/50/100); freeze cold; raise score idx carefully |
| 1M+ races | External object store or warehouse for full score bodies; Redis keeps indexes + freezes |
| High write | Keep RMW merge; optional sharded player keys later |
| Large tournaments | Standings cap 100; freeze on close |

---

## 13. Maintenance guide

| Task | How |
|------|-----|
| Check integrity | `GET /api/health?integrity=1` |
| List frozen weeks | `GET /api/history/weekly` |
| Read immutable week | `GET /api/history/weekly/{YYYY-MM-DD}` |
| Tournament archive | `GET /api/history/tournament/{id}` |
| Manual wiki backup | scheduler or score-triggered |
| Schema bump | increment `PERMANENCE_SCHEMA_VERSION`; ensure additive only |

---

## 14. Monitoring strategy

| Signal | Source |
|--------|--------|
| Integrity errors | health integrity payload + logs `[Permanence]` |
| Freeze refused | log on divergent overwrite attempt |
| Wiki write fail | `[WikiBackup]` errors |
| High WPM / bot | existing `[Monitor]` logs |
| Snapshot skip empty | `[Leaderboard] … skipped` |

Future: metrics counters for freezes created, integrity failures, restore count.

---

## 15. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Devvit uninstall wipes Redis | High | Wiki restore + freezes if Redis retained |
| Wiki size limit | Medium | Trim policy; freezes in Redis primary for history API |
| Concurrent RMW | Medium | Claim tokens; freeze refuse; wipe guards |
| Score history cap 100 | Medium | Career counters permanent; raise cap later |
| Millions of races on Redis alone | High | Plan external cold store (roadmap) |
| Checksum not crypto | Low | Detects accidental corruption, not adversaries |

---

## 16. Implementation roadmap

### Phase A — Done this delivery

- [x] Permanence types + schema version  
- [x] `freezeSnapshot` write-once + checksum  
- [x] Wire weekly/monthly/yearly freezes  
- [x] Tournament freeze on close  
- [x] Career counters on profile  
- [x] Integrity API + install bootstrap  
- [x] History read APIs  
- [x] Automated immutability / corruption tests  

### Phase B — Near term

- [ ] UI: browse frozen weeks/months from leaderboard  
- [ ] Raise or archive score history beyond 100 with offline export  
- [ ] Seal freezes into wiki export payload  
- [ ] Challenge GC policy (age out unused challenges without scores)  

### Phase C — Scale

- [ ] External cold store (S3-compatible) for full race transcripts  
- [ ] Analytics rollups (Layer 3)  
- [ ] Audit log stream for moderator actions  
- [ ] Seasonal “named season” entities  

### Phase D — Hardening

- [ ] Pre-deploy integrity gate in CI against playtest  
- [ ] Dual-write freezes + signed checksum export  
- [ ] Runbook automation for restore drills  

---

## 17. API surface (permanent history)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness |
| GET | `/api/health?integrity=1` | Layer-2 integrity (503 if errors) |
| GET | `/api/history/:kind` | List frozen period keys |
| GET | `/api/history/:kind/:periodKey` | Immutable snapshot |

`kind` ∈ `weekly` | `monthly` | `yearly` | `tournament` | `season`

---

## 18. Code map

| Module | Role |
|--------|------|
| `src/shared/types/permanence.ts` | Permanent entity types |
| `src/server/services/permanence.ts` | Freeze, meta, integrity |
| `src/server/services/leaderboard.ts` | Live boards + snapshot → freeze |
| `src/server/services/tournament.ts` | Close → archive freeze |
| `src/server/services/wikiBackup.ts` | Cold mirror |
| `tests/permanence.test.ts` | Immutability proofs |

---

*This architecture keeps EchoKeys correct on Devvit for years of community play, seals winners immutably, and defines the path to multi-million scale without sacrificing existing production data.*

---
branch: feat/feature-9-wi-1-store-model
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 3
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #9 WI-1a (sessions store-model migration)

Codex (gpt-5.5, effort high, read-only) audit of the sync-envelope migration on the
sessions store. Scope of this PR: `src/stores/sessionStore.ts` + `src/stores/sessionStore.test.ts`
only — the sessionStore slice of WI-1. glossaryStore + the `keywords string[] → Keyword[]`
conversion are deferred to follow-up slices (WI-1b / WI-1c).

## Round 1 — verdict: NEEDS WORK (8 findings)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | sessionStore.ts (migrate) | High | `persisted as PersistedV1` not shape-safe — `.map()` throws on a malformed v1 record (missing/non-array `sessions`/`tasks`) | **FIXED** — top-level `Array.isArray` guard → undefined; per-session `tasks` guard salvages good sessions |
| 2 | sessionStore.ts (migrate) | Medium | session `updatedAt` backfilled from `createdAt`, ignoring newer tasks → stale parent metadata | **FIXED** — `updatedAt = tasks.reduce(max, createdAt)`, matching the live `addTask` invariant |
| 3 | sessionStore.ts (migrate) | Medium | `activeSessionId` preserved without checking the session still exists → dangling id makes `addTask` silently discard | **FIXED** — keep active id only if a migrated session matches, else null |
| 4 | sessionStore.ts:43 (`genId`/`idSeq`) | High | in-memory id counter not reconciled with hydrated sessions → duplicate ids after reload | **DEFERRED to bug** — pre-existing (feature #3), NOT in this diff; filed as a separate bug + fixed via `/fix-issue` to keep this WI focused. Codex agreed (round 2) provided it is treated as a real High |
| 5 | sessionStore.ts:66 (`searchSessions`) | Low | selector doesn't filter `deletedAt !== null` | **ACCEPTED w/ rationale** — by design; tombstones cannot exist until the WI that adds tombstone creation also adds selector filtering. No window where a tombstone exists unfiltered. Codex accepted (round 2) |
| 6 | sessionStore.ts (migrate) | Medium | additive `deletedAt:null` sound only if the sync layer treats pre-tombstone hard deletes as baseline, not resurrections | **RESOLVED via docs** — documented the sync-baseline boundary in the migrate doc comment (+ plan) |
| 7 | sessionStore.test.ts | Medium | migration tests cover one happy path only | **FIXED** — added empty-sessions, zero-task, missing-tasks, non-array, dangling-active, newest-task-wins cases |
| 8 | sessionStore.test.ts | Low | `as never` bypasses type-checking | **FIXED** — `partializeSessions` called with a genuine `SessionState` from the live store; no cast |

## Round 2 — verdict: NEEDS ATTENTION (2 new robustness Mediums)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| R2-1 | sessionStore.ts (migrate) | Medium | `migrateSessions(null/undefined, 1)` still throws — no top-level object guard | **FIXED** — module-private `isRecord` guard; `if (!isRecord(persisted) ...)` returns undefined before any property access |
| R2-2 | sessionStore.ts (migrate) | Medium | null/garbage *array elements* (`sessions:[null]`, `tasks:[null]`) throw, contradicting the "salvage the rest" comment | **FIXED** — two guarded for-loops; non-object session/task entries are skipped, valid siblings salvaged; migration provably never throws |
| R2-3 | sessionStore.test.ts | Low | new cases miss null top-level / null entries | **FIXED** — added null/undefined/non-object top-level + null-session-entry + null-task-entry tests |

**Scoped-out (round 2/3, Codex-accepted):** per-field *type* validation (e.g. non-numeric
`createdAt` → cosmetic NaN). v1 data is written by lucid's own v1 code and is JSON-backed; the
guards prevent crashes on tampered/partially-corrupt storage, not arbitrary-input sanitization.
This matches the project's migration trust model (the pre-existing migrate did zero shape
validation) and zustand's boot-to-defaults safety net. Codex: "a reasonable migration boundary."

## Round 3 — verdict: CLEAN

> "No remaining issues found in the re-read. R2-#1 is resolved … R2-#2 is resolved for
> throw-safety … I accept the non-numeric `createdAt` case as scoped Low risk, not Medium+ …
> CLEAN."

Compliance (all rounds): no `any`, file under 300 lines, no vendor/provider leak, no duplication
or dead code. `pnpm check:all` green — 627 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium against this diff. The one
deferred High (#4) is a pre-existing bug outside this diff, tracked separately.

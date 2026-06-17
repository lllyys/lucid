---
branch: feat/feature-9-wi-7b-vi-a-rev-map
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-vi-a (syncStore rev-map foundation)

Codex (gpt-5.5, effort high, read-only), same thread. Foundational. Adds the orchestrator's PERSISTED
per-entity rev map (last-synced rev per entity id) to `syncStore` — the source of `baseRev` when a
local edit is queued, fed by applied push revs (WI-7b-v) + pulled entity revs (WI-7b-vi-b). Files:
`src/stores/syncStore.ts` + `src/stores/syncStore.test.ts`.

## Round 1 — verdict: NEEDS WORK (1 High + 1 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | High | defaulting missing/malformed `revs` to `{}` while preserving a NONZERO `cursor` is not self-healing — an incremental pull from that cursor never re-fetches unchanged entities, so their revs stay missing and the next local edit to one false-conflicts (under v1 server-wins, that edit is dropped). PERSIST_VERSION was still `1`, so a pre-rev-map blob was an upgrade path that hydrated a bare cursor. | **FIXED** — bumped `PERSIST_VERSION` 1→2; rewrote `migrateSync` to preserve only a valid `config` and force a full idempotent re-sync (`cursor:0, seeded:false, revs:{}`). |
| 2 | Low | stale header comment ("Only config + cursor + seeded are persisted") | **FIXED** — comment now includes the per-entity rev map. |

**Resolution detail:** confirmed against zustand 5.0.14 source (`esm/middleware.mjs:392`) that persist
calls `migrate` ONLY when `persisted.version !== options.version`; a matching-version blob hydrates
as-is. So `migrateSync` is purely the cross-version upgrade path. Its `version` param was dropped
(single-arg signature, assignable to zustand's 2-arg `migrate` slot by arity) because salvage is
version-independent: any mismatch → preserve `config`, full re-sync.

## Round 2 — verdict: CLEAN

> "No remaining issues found. The round-1 High is resolved. Bumping `PERSIST_VERSION` to `2` makes
> existing v1 blobs enter `migrateSync`, and the new migration correctly preserves only a valid
> `config` while resetting `cursor: 0`, `seeded: false`, `revs: {}` … forces a full re-sync, so the
> rev map can be rebuilt instead of preserving a non-self-healing cursor."

Codex confirmed the specific points:
- **(a)** Dropping per-version gating is safe — salvaging only a valid config + full re-sync is the
  conservative path in either direction (a future downgrade may auth/protocol-fail but never corrupts
  local data or preserves stale rev/cursor state).
- **(b)** The matching-version (v2) sanitization gap is real but NOT introduced by this WI (zustand
  never calls `migrate` for a same-version blob; the old `migrate` never ran for the current version
  in production either). `safeJSONStorage` already guards non-JSON corruption. Fixing it would need a
  store-wide `merge`/`onRehydrateStorage` sanitizer — out of scope for this rev-map foundation.
- **(c)** `connect()` correctly resets `cursor`, `seeded`, AND `revs`; `disconnect()`/`reset()` clear
  `revs` via `INITIAL`.
- **(d)** No `any`, no file-size issue (<300 lines), no vendor leak; header comment accurate.

## Carried forward to later WI-7b-vi sub-slices (noted by the audit, not a blocker here)

- Lingering tombstoned rev entries: when an entity is deleted, its rev-map entry is not yet purged.
  Acceptable v1 debt — the orchestrator's delete/lifecycle slice (WI-7b-vi-c/d) handles rev-map
  pruning on delete-wins.

`pnpm check:all` green — 820 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium for this slice.

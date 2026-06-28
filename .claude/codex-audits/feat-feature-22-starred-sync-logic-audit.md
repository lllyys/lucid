---
branch: feat/feature-22-starred-sync-logic
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-28
---

# Gate-4 audit — feature #22 WI-1+WI-2 (headless starredStore + the `'starred'` #9 sync entity, client + server)

Independent Claude auditor (read-only, diff-scoped, 1272-line diff). Against the Gate-2-PASSED plan v2.
**ship-as-is, 0 open Critical/High/Medium.**

## Verified (all Gate-2 decisions built correctly + complete)
- **Store (WI-1)** mirrors `glossaryStore`: random `st_<uuid>` id (counter seam), `star()` content-scan dedupe
  over `(kind,source,context,sourceLang,targetLang)` (no-op on hit), `unstar()` HARD-removes (no soft
  tombstone), `searchStarred`, `safeJSONStorage`, `PERSIST_VERSION 1`, never-throwing `migrateStarred`. 132
  lines, no `any`.
- **Server (the Critical) complete** — `VALID_TYPES` (`server/src/db.ts`) is the single allow-list (used by both
  `assertValidOp` push-reject + `rowToEntity` pull/echo); + the compile-coupled `EntityType`
  (`server/src/types.ts`). Both server tests assert a `'starred'` op is accepted (was 400) + round-trips with a
  rev. No other server allow-list.
- **All client touchpoints threaded (the High)** — `types.ts`/`guards.ts`; `seed.ts`
  (`LocalSnapshot.starred` + `flattenLocal`); `reconstruct.ts` (`entityToStarred`, TERM path, optional fields
  string-validated); `reconcile.ts` (upsert + delete-wins + return type); `pull.ts` (`PullOutcome.snapshot`,
  populated via `reconcileStores`, not a stale literal); the 3 impure sites — `runSyncCycle.ts` (readSnapshot +
  the runSuppressed `useStarredStore.setState` commit), `editTracker.ts` (snapshot + subscribe),
  `syncController.ts` (seed snapshot). No site missed.
- **`setCounts` NOT touched (r2-L1)** — `SyncCounts`/`ZERO_COUNTS`/`ConnectedPanel.tsx` absent from the diff;
  starred intentionally not counted (avoids the design-gated counts grid).
- **`ConflictCard` label** — a compile-FORCED `'starred'` entry in the exhaustive `Record<EntityType,string>`
  + its locale key; completes an existing designed element (rule-51-exempt), inert until starred conflicts
  exist (post-WI-3). Not invented chrome.
- **No app-behavior change** — no production code calls `.star()`/`.unstar()`; with an empty store + no UI, no
  runtime emits a starred op; existing flows untouched. No UI wiring.
- **Coverage / lucid** — root gate 100% on `src/stores`+`src/lib/sync` (non-contrived branch coverage incl. the
  editTracker tombstone test, which relies on the entity-agnostic `diff.ts`); server tests green; no `any`; no
  vendor import; files <300. Existing 4-entity test helpers coherently updated to the 5th entity.

## Findings (all Low — accepted)
- **Low (fixed):** stale plan test-catalogue word ("counted") → corrected to "NOT counted (r2-L1)".
- **Low (process):** version bump is the tail commit (this audit log + the bump land before the PR).
- **Low (accepted, WI-3 concern):** `star()` trusts a structured input without an empty/whitespace `source`
  guard (different contract from `addTerm`'s raw string; no caller yet). WI-3 must guard the star button so an
  empty source can't be starred.

## Gate
Root `pnpm check:all`: lint + typecheck + **100% gated coverage** + build; **1677 tests**. Server
`cd server && pnpm test`: **134 tests**. No app wiring → no behavior change (WI-3/WI-4, the star indicators +
review surface, are design-gated → needs-design #183). Verification: WI-1 foundational; WI-2 a sync-wire/network
change → **mock-backend slice verification** is satisfied by the high-fidelity push/pull/reconcile/seed tests at
the real `SyncBackend` boundary (the entity round-trips through the actual server tests) — no live env needed.

## Verdict
ship-as-is.

---
branch: feat/feature-9-wi-7b-reconcile
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-iii (reconcileStores — apply merged entities)

Codex (gpt-5.5, effort high, read-only), same thread. Foundational. The 3rd WI-7b slice:
`reconcileStores(current, resolved)` applies a merged `SyncEntity[]` into local store state and returns
the next snapshot (the orchestrator writes it to the stores). Pure, two-pass (sessions/terms/keywords,
then tasks) for order-independence. Files: `src/lib/sync/reconcile.ts` + test.

## Round 1 — verdict: NEEDS WORK (2 High)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | reconcile.ts (session/term/keyword) | High | tombstones were gated behind payload **reconstruction** — a valid delete with an empty/minimal payload (`{payload:{}, deletedAt:5}`, which a server may legitimately send) was skipped, leaving the entity live → **violates delete-wins** | **FIXED** — handle `deletedAt !== null` by deleting on the envelope `id` BEFORE reconstruction; reconstruct only for live upserts |
| 2 | reconcile.ts (task) | High | task tombstones likewise required a valid payload + `sessionId` to remove — a minimal task tombstone left the stale task | **FIXED** — a task delete removes the id from whichever session holds it (iterate the session map, filter by id), no payload/`sessionId` needed |

Confirmed sound in R1 (live-upsert paths): task-before-session works (two-pass), session upserts
preserve the cloned current tasks, live task upserts replace by id without duplication, orphan live
tasks are dropped, and `current`/nested arrays are never mutated. Returning only the next snapshot is
enough — cursor/rev bookkeeping belongs in the orchestrator (using the original resolved entities).

Regression tests added: empty-payload session/term/keyword tombstones all delete; an empty-payload task
tombstone (no `sessionId`) removes by id; a tombstoned task leaves other sessions untouched.

## Round 2 — verdict: CLEAN

> "Delete-wins now holds for all four entity types: session/term/keyword tombstones delete by envelope
> `id` before payload reconstruction, and task tombstones remove by task `id` across the session map
> without needing `sessionId` … The live upsert paths remain sound … the function does not mutate
> `current` or nested task arrays … CLEAN."

`pnpm check:all` green — 808 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. Next WI-7b slice: the async cycle
(pull → collectLocal → mergeEntities → reconcileStores → advance cursor → push queue → ack → status),
then the lifecycle.

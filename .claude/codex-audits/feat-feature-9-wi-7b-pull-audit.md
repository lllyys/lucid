---
branch: feat/feature-9-wi-7b-pull
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 3
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-iv (syncPull — the pull half of a cycle)

Codex (gpt-5.5, effort high, read-only), same thread. Foundational. `syncPull(backend, cursor,
snapshot, pendingBaseRevs)` pulls changes since the cursor → `collectLocal` → `mergeEntities` →
`reconcileStores`, returning `{ok, cursor, conflicts, snapshot}` or `{ok:false, error}`. Pure-async
(only side effect: `backend.pull`); the orchestrator applies the returned snapshot + advances the
cursor. Files: `src/lib/sync/pull.ts` + test.

## Round 1 — verdict: NEEDS ATTENTION (1 Medium)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Medium | returned `maxRev` verbatim — a buggy/malicious server reporting `maxRev < cursor` (or `< max(change.rev)`) regresses the cursor → repeated/stuck pulls | **FIXED** — advance monotonically: `Math.max(cursor, maxRev, …change.rev)` |

**Design confirmed sound:** the no-separate-rev-map approach — for a pending id, the queued `baseRev` is
exactly the rev the merge needs for the supersession check; for a non-pending id, `rev: 0` is harmless
(merge adopts remote whenever the id appears in the pull). Returning the reconciled snapshot + conflicts
is the right separation (conflict is a signal; the snapshot already reflects server-wins).

## Round 2 — verdict: NEEDS ATTENTION (1 Medium)

| # | sev | finding | disposition |
|---|---|---|---|
| R2-1 | Medium | the monotonic fix used `Math.max(...changes.map(...))` — spreading one argument per change **throws RangeError** for a large (initial-sync / malicious) batch, violating never-throw | **FIXED** — fold with `reduce` (no spread); added a 50,000-change regression test asserting no-throw + correct cursor |

## Round 3 — verdict: CLEAN

> "The reduce-based cursor fold is correct: empty `changes` uses the seed `Math.max(cursor, maxRev)`,
> and non-empty batches advance to the highest of requested cursor, reported `maxRev`, and applied
> change revs. The spread overflow hazard is gone, and the 50k-change regression test covers the failure
> mode directly. `syncPull` is clean … no mutation, no store access, error passthrough intact … CLEAN."

`pnpm check:all` green — 815 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. Next WI-7b slice: `syncPush` (drain the
queue → ack applied → reconcile conflicts), then the engine (combine pull+push+status+lifecycle).

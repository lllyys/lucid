---
branch: feat/feature-9-wi-7b-collect
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 1
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-i (local-snapshot projection)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1..7a. Foundational. Files:
`src/lib/sync/seed.ts` (refactor) + test. First slice of the WI-7 orchestrator (bottom-up): the pure
`collectLocal` that produces the per-cycle merge input, sharing a `flattenLocal` with the existing
`buildSeedFromLocal` (DRY).

## Round 1 — verdict: CLEAN (zero findings)

> "The refactor preserves the prior seed output: `flattenLocal` produces the same
> session/task/term/keyword projections, and `buildSeedFromLocal` only adds `baseRev: 0` on top.
> `collectLocal(snapshot, revs)` is correct for WI-3 merge input. Unknown ids defaulting to `rev: 0`
> matches 'never synced'; if the server has a higher remote rev, merge will correctly treat it as
> authoritative. Producing `SyncEntity` with `rev` and no `baseRev` is the right shape.
> `FlatEntity = Pick<SyncEntity, ...>` is clean here and avoids duplicate projection logic. Type-only
> store imports remain an acceptable one-way projection boundary. No dead code, `any`, size, purity, or
> vendor-leak issues found. CLEAN."

Compliance: no `any`, pure, file < ~300 lines, no vendor leak, store→sync type-only one-way import.
`pnpm check:all` green — 759 tests, 100% stmts/branches/funcs/lines (the WI-5a seed tests still pass
unchanged, confirming no behavior regression from the extraction).

**Summary verdict: ship-as-is.** Zero findings. Foundational tier — pure-function unit tests + audit
satisfy verification. Next WI-7b slices: the per-entity rev map + the async pull→merge→apply→push→ack
cycle (incl. sync→domain reconstruction with payload validation, task re-nesting, tombstone/selector
filtering) and the lifecycle (drain/debounce/listeners/INERT-when-off).

---
branch: feat/feature-9-wi-7b-reconstruct
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 3
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-ii (validated sync→domain reconstructors)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1..7b-i. Foundational. The 2nd WI-7b slice:
`entityToSession/entityToTask/entityToTerm/entityToKeyword` — reconstruct domain entities from merged
`SyncEntity`s (the inverse of `flattenLocal`), validating the opaque payload to prevent store
poisoning. Files: `src/lib/sync/reconstruct.ts` + test, `src/lib/guards.ts` (+ shared `isNonNegInt`) +
test, `src/lib/sync/guards.ts` (refactor onto the shared guard), `src/lib/keywordId.ts` (extracted) +
test, `src/stores/polishKeywordsStore.ts` (+ test) imports.

## Round 1 — verdict: NEEDS ATTENTION (2 Medium + 2 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Medium | `createdAt` validated only as `typeof === 'number'` (session/task/term) → admits `Infinity`/`NaN`/fraction/negative/>2^53 as persisted timestamps | **FIXED** — extracted shared `isNonNegInt(v): v is number` (non-negative safe integer; 0 valid) to `src/lib/guards.ts`; all `createdAt` use it. Refactored `src/lib/sync/guards.ts` to consume it (removed its private copy) |
| 2 | Medium | keyword reconstruction trusted any `e.id` despite identity being `keywordId(value)` → a mismatched id poisons the store + breaks same-value convergence | **FIXED** — `entityToKeyword` requires `value !== '' && e.id === keywordId(value)` |
| 3 | Low | empty `sessionId` passes → orphan task | **FIXED** — require `sessionId !== ''` |
| 4 | Low | term `label` accepts empty/untrimmed | **ACCEPTED w/ rationale** — type-valid + non-crashing; trim/dedup are create-time (`addTerm`) invariants, and the server is authoritative for synced terms, so rejecting would drop server data (distinct from keyword id-consistency, a hard sync-identity invariant). Codex (R2): "I agree with the term-label disposition." |

## Round 2 — verdict: NEEDS ATTENTION (1 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| R2-1 | Low (refactoring debt) | `reconstruct.ts` imported `keywordId` from `polishKeywordsStore`, pulling the Zustand store module in as an import side effect — `reconstruct` should be pure | **FIXED** — extracted `keywordId` to a pure `src/lib/keywordId.ts`; `reconstruct` imports it from there (+ type-only store import); `polishKeywordsStore` consumes the same helper; keywordId tests moved to `keywordId.test.ts` |

## Round 3 — verdict: CLEAN

> "`reconstruct.ts` now imports only `keywordId` from the pure `@/lib/keywordId` module plus type-only
> store imports, so it no longer initializes the Zustand keyword store as a side effect … `keywordId`
> behavior is unchanged … No duplicate definition, stale import, `any`, or file-size issue found. CLEAN."

Confirmed-fine: `isNonNegInt` as a `v is number` guard doesn't weaken `sync/guards.ts` (timestamps/cursor
still allow 0; rev still requires `isPosInt`); the entityToSession(tasks:[]) / entityToTask({task,
sessionId}) decomposition is right for the WI-7b-iii re-nesting; the task `kind` guard covers both kinds.

`pnpm check:all` green — 794 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. Next WI-7b slice: `reconcileStores`
(apply merged entities into the stores — re-nest tasks, upsert, tombstone removal), then the async cycle.

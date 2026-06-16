---
branch: feat/feature-9-wi-2-sync-types
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 3
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #9 WI-2 (sync types + shared guard extraction)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1. Foundational WI. Files: `src/lib/sync/types.ts`
(EntityType, SyncEntity, PushOp, PushResult, PullResult, SyncError), `src/lib/sync/guards.ts` + test
(hand-written boundary guards, no zod), `src/lib/guards.ts` + test (shared `isRecord`, extracted from the 3
stores), the 3 store imports, and `.claude/hooks/tdd-guard.mjs` (scope += `src/lib/sync/**`).

## Round 1 — verdict: NEEDS ATTENTION (3 Medium + 1 Low)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | guards.ts `isSyncEntity` | Medium | `payload` accepted arrays (`isRecord([])` is true), but a SyncEntity payload is always an object → a `payload: []` would slip the boundary and break a store decoder | **FIXED** — `isPayload = isRecord(v) && !Array.isArray(v)` |
| 2 | guards.ts numeric fields | Medium | any number accepted — negative/fractional rev, negative timestamps, non-integer cursor pass; spike relies on monotonic **integer** server revs | **FIXED** — `isNonNegInt` (timestamps/cursor, 0 allowed) + `isPosInt` (rev ≥ 1) |
| 3 | guards.ts `isPushResult` | Medium | a conflict with `server.id !== id` passed → client would reconcile the wrong entity | **FIXED** — require `isSyncEntity(v.server) && v.server.id === v.id` |
| 4 | tdd-guard.mjs:124 | Low | block message + top comment still listed only providers/translation/polish/stores after `src/lib/sync` was added to scope | **FIXED** — both updated (also added the previously-omitted `src/lib/providers`) |

Confirmed-fine: extracting `isRecord` to neutral `src/lib/guards.ts` (avoids a store→sync-feature dependency,
preserves prior behavior incl. arrays → true); the type surface matches the spike (`maxRev` is the cursor;
conflict-resolution inputs can wait for WI-3's merge API — not a gap).

## Round 2 — verdict: NEEDS ATTENTION (1 Medium)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| R2-1 | guards.ts `isNonNegInt`/`isPosInt` | Medium | `Number.isInteger` accepts unsafe integers above 2^53, where JSON precision is lost → two distinct server revs could compare equal, corrupting the ordering authority | **FIXED** — switched both to `Number.isSafeInteger`; added reject tests for `MAX_SAFE_INTEGER + 1` on rev/updatedAt/maxRev |

## Round 3 — verdict: CLEAN

> "The unsafe-integer issue is resolved … Legitimate values still pass: `updatedAt: 0`, `maxRev: 0`, small
> positive revs, and Date.now-scale timestamps. The prior WI-2 findings remain fixed … CLEAN."

## Notes

- Types mirror the Phase-0 spike's validated `{type,id,payload,updatedAt,deletedAt,rev}` row + `baseRev` push
  ops + `{applied|conflict}` results. `payload` is opaque to the sync/merge layer.
- Guards validate the untrusted server-response boundary (WI-4 will parse through `isPullResult` /
  `isPushResult` / `isSyncEntity`); built on the shared `isRecord`.
- `isRecord` extraction de-duplicates the 3 store migrations (the deferral promised in WI-1c) into neutral
  `src/lib/guards.ts`. The sync layer is now TDD-guard-scoped.

Compliance: no `any`, no zod, all files < ~300 lines, no vendor leak. `pnpm check:all` green — 697 tests,
100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. Foundational tier — unit tests + audit
satisfy verification (no user-observable behavior).

---
branch: feat/feature-9-wi-7b-vi-d1-queue-store
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-vi-d-1 (persisted offline push-queue store)

Codex (gpt-5.5, effort high, read-only), same thread. Foundational. The PERSISTED store that holds the
offline `PushQueue` (as a JSON-friendly `QueueEntry[]`) so offline edits survive a reload; the lifecycle
(rest of vi-d) wires it to the live stores and drains it through `runCycle`. Files: NEW
`src/stores/syncQueueStore.ts` + test; additive `isPushOp` guard in `src/lib/sync/guards.ts` + test.

## Round 1 — verdict: NEEDS WORK (1 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Low | duplicate-id sanitization kept the FIRST entry — for a tampered/corrupt blob with a duplicate id, that could preserve a stale op and drop the newer one; `seq` is the available freshness signal. | **FIXED** — `sanitizeQueueEntries` now de-dupes via a Map keyed by `op.id`, taking `e.seq >= existing.seq` (higher seq replaces; equal seq → later wins). Map-key update preserves the first-occurrence slot, so order is stable. Test proves stale-first → newer-wins → lower-ignored. |

Affirmed clean in round 1: the array↔Map round-trip preserves normal queue semantics (no double-bump, insertion order via `pending`); `merge` is the correct hydration hook for sanitizing a current-version blob (zustand calls `migrate` only on a version mismatch) and `mergeSyncQueue` preserves the live actions; `isPushOp` correctly uses a non-negative `baseRev` (0 = expect-new) where the server `rev` is positive; persisting full PushOps (incl. payload) is acceptable offline durability — the app already persists domain text and no API keys are involved.

## Round 2 — verdict: CLEAN

> "The duplicate-id fix resolves the prior Low: `sanitizeQueueEntries` now uses `seq` as the freshness
> signal, replaces on higher `seq`, and the `>=` rule makes equal-seq duplicates keep the later entry.
> Updating an existing key in `Map` preserves the first insertion slot, so order stability matches the
> documented behavior. The store still round-trips through the pure queue correctly, `mergeSyncQueue`
> preserves actions, and the test now covers stale-first/newer-wins/lower-ignored. Files under 300
> lines, no `any`, no dead code, no vendor leak. CLEAN"

`pnpm check:all` green — 100% stmts/branches/funcs/lines, 859 tests.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium.

---
branch: feat/feature-9-wi-7b-vi-d3-run-cycle
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-vi-d-3 (run one sync cycle against the live stores)

Codex (gpt-5.5, effort high, read-only), same thread. The IMPURE orchestrator boundary that wires the
pure engine (`runCycle`) to the app's zustand stores. Files: NEW `src/lib/sync/applyGuard.ts` + test,
`src/lib/sync/runSyncCycle.ts` + test (real stores + mock backend).

## Design

- `applyGuard`: a synchronous echo guard (`isApplyingSync()` / `runSuppressed(fn)`, nestable — restores
  the prior flag). The edit subscription (next slice) checks it to skip the orchestrator's OWN commit
  writes; works because zustand fires subscribers synchronously during setState.
- `runSyncCycle(backend)`: setStatus('syncing'); read queue/snapshot/cursor/revs → `runCycle`; on `!ok`
  map the SyncError to a status (auth→`auth-error`, else `unreachable`); on `ok` reconcile `apply` into
  the domain stores under the echo guard, then `setRevs`/`setCursor`/`ack(startEntries)`/`setQueuedCount`/
  `setCounts`/`recordConflict`/`setStatus`.

## Round 1 — verdict: NEEDS WORK (1 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Low | `recordConflict` was passed the full `Conflict` ({type,id,local,server}); the store contract is `SyncConflictInfo {type,id}` (the v1 surfaced signal). Structural typing let the extra payloads through; the test used `toMatchObject` so it missed them. | **FIXED** — project to `{ type, id }`: `const lastConflict = outcome.conflicts.at(-1); recordConflict(lastConflict ? { type, id } : null)`. Conflict test now asserts `toEqual({type,id})` (exact). |

Affirmed clean in round 1: the echo guard is scoped to ONLY the synchronous domain-store writes and does not leak across the `await`; re-reading the live snapshot before reconcile is correct (preserves a mid-cycle local edit, which `apply` excludes); acking `startEntries` against the live queue is equivalent to the engine's seq-gated ack under the single-call assumption; the `src/lib/sync → @/stores` import direction is acceptable for this explicitly-impure boundary (no circular import).

## Round 2 — verdict: CLEAN

> "The Low is resolved: `lastConflict` is now projected to the exact `{ type, id }` store contract, and
> the test asserts exact equality so `local`/`server` payloads cannot slip back in unnoticed. The commit
> ordering, echo-guard scope, queue ack behavior, and status/conflict consistency are unchanged and
> still sound. CLEAN"

## Carried forward to WI-7b-vi-d-4 (the orchestrator lifecycle)

- The edit subscription must check `isApplyingSync()` and skip when true (the echo guard's consumer).
- Single-in-flight drain; `offline` status when `navigator.onLine` is false; `lastSyncedAt` stamp on a
  successful cycle (deferred from here — needs the lifecycle's timing/clock); opt-in / INERT-when-off.

`pnpm check:all` green — 100% stmts/branches/funcs/lines, 880 tests.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium.

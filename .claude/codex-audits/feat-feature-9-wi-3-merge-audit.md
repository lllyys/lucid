---
branch: feat/feature-9-wi-3-merge
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #9 WI-3 (pure mergeEntities)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1/WI-2. Foundational WI. Files:
`src/lib/sync/merge.ts` + test (the pure conflict-resolution engine), `src/lib/sync/types.ts`
(+Conflict, +MergeResult).

## Round 1 — verdict: NEEDS ATTENTION (1 Medium)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | merge.ts (remoteById) | Medium | `new Map(remote.map(...))` keeps the LAST entry for a duplicate id → a malformed batch `[{a,rev:5},{a,rev:1}]` lets the stale rev-1 dup win the map, masking the real supersession (order-dependent); `isPullResult` permits dup ids so WI-4's parsed JSON can reach this | **FIXED** — normalize `remote` by id keeping the highest rev before merging; the remote-only loop iterates the normalized map. Chosen over rejecting the whole pull batch (resilient: good entities still merge). Regression test asserts higher-rev dup wins + conflicts in both orderings |

Confirmed correct in R1: `remote.rev > local.rev` is the right authority test (rev only, never `updatedAt`); the clock-skew test (higher-rev remote with OLDER updatedAt still wins) validates the right behavior; `remote.rev <= local.rev → keep pending local` is sound (equal = remote is the base row, lower = stale input); delete-then-readd convergence is correct (higher-rev tombstone wins + records a conflict carrying the local re-add; the re-add re-pushes to a new higher rev next round). Purity/no-any/file-size/no-vendor-leak all clean.

Explicitly out of WI-3's scope (WI-7 orchestrator owns): applying `resolved` back into the stores, preserving the pending/conflict signals, advancing per-entity-type rev cursors, and entities not present in the current pull batch (a remote delete that didn't land in this batch). Not gaps in WI-3.

## Round 2 — verdict: CLEAN

> "The duplicate-remote masking issue is resolved. `remoteById` now normalizes by highest `rev` before
> reconciliation, and the remote-only pass iterates the normalized map … No new logic, duplication,
> dead-code, file-size, or purity issues found. CLEAN."

## Notes

mergeEntities(local, remote, pending) → {resolved, conflicts}. Server-rev-primary LWW + delete-wins
(both fall out of the rev comparison), pure + deterministic + order-independent. The conflict carries
the superseded local edit + the winning server entity — the v1 surfaced signal (review/restore
deferred per the design). Validated against the Phase-0 spike's proven scenarios (clock-skew immunity,
delete-then-readd convergence, eviction-as-tombstone).

`pnpm check:all` green — 709 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. Foundational tier — unit tests +
audit satisfy verification (pure function, no user-observable behavior).

---
branch: feat/feature-9-wi-7b-vi-d2-diff-to-ops
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-vi-d-2 (delta projection: snapshot diff → PushOps)

Codex (gpt-5.5, effort high, read-only), same thread. Foundational. `diffToOps(prev, next, revs, now)`
turns two consecutive local snapshots into the PushOps to enqueue; the orchestrator's store subscription
(next slice) calls it on every domain-store change while sync is active. Files: NEW `src/lib/sync/diff.ts`
+ test; additive `export` of `flattenLocal` + `FlatEntity` from `src/lib/sync/seed.ts`.

## Round 1 — verdict: NEEDS WORK (1 Medium)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Medium | `sameContent` compared only payload + deletedAt, ignoring `updatedAt`, so an envelope-only change was dropped. Concretely `addTask` bumps the parent session's `updatedAt` while its payload (`{name, createdAt}`) is unchanged → the session's "last activity" bump never reached the server/other devices. | **FIXED** — `sameContent` now compares `updatedAt` AND `deletedAt` AND payload. Same-ms content edits are still caught by the payload comparison; envelope-only bumps now emit an op. New test: a session with identical name/tasks but `updatedAt` 1→2 → exactly one session op. |

Affirmed clean in round 1: tombstone synthesis from hard-deletes is sound for connected online/offline cases (given the persisted queue captures the delete the instant it happens, and disconnect purges the server so a fully-disconnected delete can't resurrect); `baseRev = revs.get(id) ?? 0` is correct for changes and deletes (incl. 0 for never-synced); task flattening/deletion as separate task tombstones is correct, including a parent-session deletion producing both session and task tombstones.

## Round 2 — verdict: CLEAN

> "The Medium is resolved: `sameContent` now compares `updatedAt`, `deletedAt`, and payload, so
> parent-session activity bumps are projected while same-ms payload edits are still caught by the payload
> comparison. That does mean a real `addTask` emits both the parent `session` op and the new `task` op,
> which is correct because those are separate sync entities with separate metadata. I don't see a
> feedback problem inside this function. `diffToOps` is pure … CLEAN"

## Carried forward to WI-7b-vi-d-3 (the orchestrator/subscription)

- **Echo guard**: the subscription must NOT treat sync-APPLIED store writes (committing `apply` from a
  cycle) as new local edits — else it would re-enqueue pulled changes. Suppress diffing/enqueue while
  the orchestrator is applying a cycle outcome (a "commit in progress" flag), per Codex's note.

`pnpm check:all` green — 100% stmts/branches/funcs/lines, 869 tests.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium.

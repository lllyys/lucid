---
branch: feat/feature-9-wi-7b-vi-c-runcycle
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 3
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-vi-c (runCycle — the sync engine core)

Codex (gpt-5.5, effort high, read-only), same thread. The engine that combines a pull + a push into
one reconciled cycle: pull-first (idempotent), push the pending edits the pull didn't supersede,
ack-gated application of push results, and a commit set (`apply`) that preserves mid-cycle local edits.
Files: NEW `src/lib/sync/cycle.ts` + `cycle.test.ts`; additive change to `src/lib/sync/pull.ts` +
`pull.test.ts` (syncPull now also returns the raw merge output `resolved`).

## Round 1 — verdict: NEEDS WORK (1 High)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | High | `runCycle` returned `pull.snapshot` (computed from the STALE start-of-cycle snapshot). Committing it would clobber a mid-cycle local edit in the STORE even though seq-gating preserved the queue/rev. Broader than the documented pull-supersession case — affects every mid-cycle edit. | **FIXED** — took the "commit overlay" route: `syncPull` exposes raw `resolved`; `runCycle` returns `apply = resolved` minus every id still dirty after ack, deferring the reconcile to the commit layer (vi-d) which applies it against the LIVE store. Dirty ids keep their live value + re-push. |

Also affirmed in round 1: pull-first/push-last ordering (with the caveat — a push transport failure does NOT prove the server didn't commit; recovery is idempotent re-pull/re-push), supersede-filter, ack-gating condition (incl. disappeared-live-entry → safely skipped), push-overrides-pull rev precedence.

## Round 2 — verdict: NEEDS WORK (2 High)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | High | pull-derived `revUpdates`/`conflicts` were copied BEFORE the dirty filter — a mid-cycle-edited id could still be advanced to the pulled server rev (breaking the "pending id's rev == its baseRev" invariant), and a stale pull conflict for a superseded OLD edit could be surfaced even though a newer same-id edit survived. | **FIXED** — compute `stillDirty` first; after the push loop, `for (const [id, entry] of queue) revUpdates[id] = entry.op.baseRev` pins every still-dirty id to its surviving queued baseRev; `conflicts.filter(c => !stillDirty.has(c.id))` drops stale conflicts. |
| 2 | High | an ack-gated push CONFLICT advanced `revUpdates` to `server.rev` but the server winner wasn't in `apply` — the store would keep the losing local value while the rev map claimed the server rev. | **FIXED** — collect ack-gated push-conflict server entities into `conflictWinners`; `apply` filters those ids' local value out (`pushConflictIds`) and concatenates the winners, so the store reconciles to the server value. |

Round 2 also confirmed: broad non-dirty `apply` (idempotent re-apply of unchanged locals) is acceptable, not a defect; keeping `syncPull.snapshot` alongside raw `resolved` is fine as a standalone convenience now that `runCycle` no longer commits it.

## Round 3 — verdict: CLEAN

> "The round-3 fixes address both prior Highs. Pinning every post-ack dirty id back to `entry.op.baseRev`
> restores the pending-id/baseRev invariant for re-edits and first edits made mid-cycle, while non-dirty
> ids cannot be touched by that loop because they are absent from the post-ack queue. `conflictWinners`
> is also correct: a push conflict only enters that list after the seq gate passes … `ack()` then removes
> it, so the winner cannot clobber a surviving local edit. Filtering `pull.resolved` by `pushConflictIds`
> before concatenating the winner avoids double-applying the losing local value. … No `any`, no vendor
> leak, files under 300 lines, side effects limited to backend calls plus the live queue read. CLEAN"

## Carried forward to WI-7b-vi-d (lifecycle)

- vi-d reconciles `apply` against the LIVE store ATOMICALLY (single setState/reconcileStores), folds
  `revUpdates` via `setRevs`, advances the cursor, sets `lastConflict`/status, and maintains the
  invariant that a pending id's rev-map entry equals its queued op's baseRev when enqueuing edits.

`pnpm check:all` green — 100% stmts/branches/funcs/lines, 836 tests.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium after 3 rounds.

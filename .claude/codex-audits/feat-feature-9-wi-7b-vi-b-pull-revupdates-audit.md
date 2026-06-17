---
branch: feat/feature-9-wi-7b-vi-b-pull-revupdates
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 1
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-vi-b (syncPull revised for the persisted rev map)

Codex (gpt-5.5, effort high, read-only), same thread. Foundational. Revises `syncPull` per the
carried-forward WI-7b-v finding: feed `collectLocal` the FULL persisted rev map (not just pending base
revs) and RETURN the resolved entities' revs (`revUpdates`) so the orchestrator's rev map can't
regress. Files: `src/lib/sync/pull.ts` + `src/lib/sync/pull.test.ts`.

## Change

- Signature: `syncPull(backend, cursor, snapshot, pendingBaseRevs)` →
  `syncPull(backend, cursor, snapshot, revs: ReadonlyMap<string,number>, pending: ReadonlySet<string>)`.
  `revs` (full rev map) stamps every local entity via `collectLocal`; `pending` (dirty set) is passed
  separately to `mergeEntities` (the rev map covers all synced ids, not just dirty ones).
- Returns additionally `revUpdates: Record<string,number>`, built from the resolved set
  (`for (const e of resolved) revUpdates[e.id] = e.rev`).

## Round 1 — verdict: CLEAN (zero findings)

> "The new `syncPull` contract is sound. Feeding `collectLocal` the full rev map means local-kept
> entities retain their real last-synced rev, so `revUpdates` does not regress unchanged entities to
> `0`. The 'non-pending entity rev' test would fail under the old pending-only input model because that
> local entity would have been stamped with `rev: 0`."

Confirmed points:
- **Regression test is load-bearing** — would fail under the old pending-only input (local stamped 0).
- **All four merge branches' rev outcomes correct in revUpdates**: remote-only → server rev; both
  non-pending → advanced remote rev; both pending+superseded → advanced server rev (conflict surfaced);
  both pending+not-newer → unchanged base rev (local edit kept).
- **Tombstoned resolved revs are safe** for this contract — `reconcileStores` deletes them from the
  stores; the rev map keeping the tombstone rev is useful for a later same-id re-add and matches the
  accepted v1 lingering-rev debt.
- **The (revs, pending) split loses no merge info** — PROVIDED the orchestrator maintains the
  invariant: for a pending id, `revs.get(id)` is the queued op's `baseRev` until that op resolves.
  Codex confirmed this is the right layer for the invariant (the rev map is now the baseRev source);
  `syncPull` is pure and correct w.r.t. its inputs. Enforcing the invariant is WI-7b-vi-c's job.
- **lucid compliance**: no `any`, file <300 lines, no vendor leak, pure-async (only `backend.pull`).

`pnpm check:all` green — 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium.

// Purpose: the pull half of one sync cycle (#9 WI-7b). Pulls the entities changed since the cursor,
// merges them against local state (server-`rev` authority, WI-3), and computes the next local snapshot
// to apply — returning it plus the advanced cursor, any surfaced conflicts, and the resolved entities'
// revs (`revUpdates`). Pure-async: the only side effect is `backend.pull`; the caller (the orchestrator)
// writes the returned snapshot to the stores, advances the cursor, and folds `revUpdates` into its
// persisted rev map. On a transport failure it returns the mapped SyncError untouched.
//
// Two distinct inputs feed the merge (WI-7b-vi):
//   • `revs` — the FULL persisted per-id rev map (last-synced rev per entity, 0 = never synced). Every
//     local entity is stamped from it, so a resolved local-kept entity carries its TRUE rev. That is
//     why `revUpdates` (built from the resolved set) cannot regress an unchanged entity's rev to 0 —
//     which would otherwise make a future edit push from baseRev 0 and false-conflict.
//   • `pending` — the set of ids with an UN-pushed local edit ("dirty"). Only these locals are at risk
//     in the merge (server-wins on a higher remote rev); a non-pending local always yields to the
//     server. Kept separate from `revs` because the rev map covers ALL synced ids, not just dirty ones.

import { collectLocal } from './seed'
import { mergeEntities } from './merge'
import { reconcileStores } from './reconcile'
import type { SyncBackend } from './backend'
import type { LocalSnapshot } from './seed'
import type { Conflict, SyncEntity, SyncError } from './types'
import type { Session } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'
import type { StarredItem } from '@/stores/starredStore'

export type PullOutcome =
  | {
      ok: true
      cursor: number
      conflicts: Conflict[]
      snapshot: { sessions: Session[]; terms: Term[]; keywords: Keyword[]; starred: StarredItem[] }
      // The raw merge output (server-authoritative reconciled entities, pre-reconstruction). The cycle
      // engine (WI-7b-vi-c) applies a SUBSET of this against the LIVE store at commit — excluding ids
      // still dirty after ack — so a mid-cycle edit isn't clobbered. `snapshot` is the convenience
      // reconcile of the same set against the passed-in snapshot (a standalone, race-free view).
      resolved: SyncEntity[]
      // The resolved entities' revs, keyed by id — the orchestrator folds this into its persisted rev
      // map so a later edit to a pulled/kept entity pushes from the right baseRev (no false-conflict).
      revUpdates: Record<string, number>
    }
  | { ok: false; error: SyncError }

export async function syncPull(
  backend: SyncBackend,
  cursor: number,
  snapshot: LocalSnapshot,
  revs: ReadonlyMap<string, number>,
  pending: ReadonlySet<string>,
): Promise<PullOutcome> {
  const res = await backend.pull(cursor)
  if (!res.ok) return { ok: false, error: res.error }
  const local = collectLocal(snapshot, revs)
  const { resolved, conflicts } = mergeEntities(local, res.value.changes, pending)
  // Advance the cursor MONOTONICALLY: never below the requested cursor (a buggy server reporting a
  // smaller maxRev must not make us re-pull forever) and never below the highest rev we just applied
  // (else those changes re-pull next cycle). Fold with reduce, NOT `Math.max(...changes)` — spreading
  // one argument per change throws RangeError for a large (initial-sync / malicious) batch.
  const nextCursor = res.value.changes.reduce((m, e) => Math.max(m, e.rev), Math.max(cursor, res.value.maxRev))
  // The resolved set's revs ARE the next rev map: remote-won entities carry the new server rev,
  // local-kept entities carry their (full-rev-map-sourced) last-synced rev — so no entry regresses.
  const revUpdates: Record<string, number> = {}
  for (const e of resolved) revUpdates[e.id] = e.rev
  return { ok: true, cursor: nextCursor, conflicts, snapshot: reconcileStores(snapshot, resolved), resolved, revUpdates }
}

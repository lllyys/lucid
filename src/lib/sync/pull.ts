// Purpose: the pull half of one sync cycle (#9 WI-7b). Pulls the entities changed since the cursor,
// merges them against local state (server-`rev` authority, WI-3), and computes the next local snapshot
// to apply — returning it plus the advanced cursor and any surfaced conflicts. Pure-async: the only
// side effect is `backend.pull`; the caller (the orchestrator) writes the returned snapshot to the
// stores and advances the cursor. On a transport failure it returns the mapped SyncError untouched.
//
// `pendingBaseRevs` carries the last-synced rev for each id with an UN-pushed local edit (sourced from
// the offline queue's PushOp baseRevs). The merge only consults a local entity's rev when it is
// pending, so non-pending entities need no rev tracking — there is no separate per-entity rev map.

import { collectLocal } from './seed'
import { mergeEntities } from './merge'
import { reconcileStores } from './reconcile'
import type { SyncBackend } from './backend'
import type { LocalSnapshot } from './seed'
import type { Conflict, SyncError } from './types'
import type { Session } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'

export type PullOutcome =
  | { ok: true; cursor: number; conflicts: Conflict[]; snapshot: { sessions: Session[]; terms: Term[]; keywords: Keyword[] } }
  | { ok: false; error: SyncError }

export async function syncPull(
  backend: SyncBackend,
  cursor: number,
  snapshot: LocalSnapshot,
  pendingBaseRevs: ReadonlyMap<string, number>,
): Promise<PullOutcome> {
  const res = await backend.pull(cursor)
  if (!res.ok) return { ok: false, error: res.error }
  const local = collectLocal(snapshot, pendingBaseRevs)
  const { resolved, conflicts } = mergeEntities(local, res.value.changes, new Set(pendingBaseRevs.keys()))
  // Advance the cursor MONOTONICALLY: never below the requested cursor (a buggy server reporting a
  // smaller maxRev must not make us re-pull forever) and never below the highest rev we just applied
  // (else those changes re-pull next cycle). Fold with reduce, NOT `Math.max(...changes)` — spreading
  // one argument per change throws RangeError for a large (initial-sync / malicious) batch.
  const nextCursor = res.value.changes.reduce((m, e) => Math.max(m, e.rev), Math.max(cursor, res.value.maxRev))
  return { ok: true, cursor: nextCursor, conflicts, snapshot: reconcileStores(snapshot, resolved) }
}

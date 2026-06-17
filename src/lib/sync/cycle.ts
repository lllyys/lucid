// Purpose: one full sync cycle (#9 WI-7b-vi) — the engine that combines a pull and a push into a
// single reconciled step. PULL-FIRST: the pull is idempotent until the caller commits, so a later push
// failure can discard it and re-pull next cycle with no loss. Then PUSH the pending edits the pull did
// NOT already supersede (re-pushing a superseded edit would only re-conflict). PURE-ASYNC: the only
// side effects are backend.pull / backend.push; the caller (the lifecycle layer, WI-7b-vi-d) commits
// the returned cursor / revUpdates / queue / apply to the stores. On any transport failure it returns
// the mapped SyncError and the caller commits nothing. (A push transport failure does NOT prove the
// server didn't commit — the response may just be lost; recovery is idempotent re-pull/re-push, not a
// guarantee of non-commit.)
//
// `apply` is the set of server-authoritative entities the commit layer reconciles into the stores. It
// EXCLUDES every id still dirty after ack (re-edited mid-cycle, or first-edited mid-cycle): those keep
// their LIVE optimistic store value and re-push from the queue, so committing this cycle never clobbers
// a mid-cycle local edit. The commit layer reconciles `apply` against the LIVE store atomically
// (reconcileStores), which is why the engine returns raw entities rather than a pre-baked snapshot
// computed from the now-stale start-of-cycle snapshot.
//
// Ack-gating (the WI-7b-v requirement): push results are applied against the LIVE queue read AFTER the
// push await. A mid-push edit bumps that id's seq, so `ack` keeps it and its stale applied-rev /
// conflict-server is NOT applied over the newer edit; the rev map is only advanced for an entry the
// ack actually removed — preserving the invariant that a pending id's rev-map entry equals its queued
// op's baseRev (WI-7b-vi-b).

import { syncPull } from './pull'
import { syncPush } from './push'
import { ack, pending } from './queue'
import type { PushQueue } from './queue'
import type { SyncBackend } from './backend'
import type { LocalSnapshot } from './seed'
import type { Conflict, SyncEntity, SyncError } from './types'

export interface CycleInput {
  cursor: number
  revs: ReadonlyMap<string, number> // the full persisted per-id rev map (WI-7b-vi-a)
  snapshot: LocalSnapshot
  queue: PushQueue // the queue at cycle start
  // Reads the CURRENT queue for ack-gating after the push await — so a mid-push re-edit (bumped seq) is
  // not dropped and its result is not applied over it. Defaults to the start-of-cycle queue (no race).
  liveQueue?: () => PushQueue
}

export type CycleOutcome =
  | {
      ok: true
      cursor: number
      revUpdates: Record<string, number>
      queue: PushQueue
      apply: SyncEntity[] // server changes to reconcile into the LIVE store (excludes still-dirty ids)
      conflicts: Conflict[]
      status: 'idle' | 'conflict'
    }
  | { ok: false; error: SyncError }

export async function runCycle(backend: SyncBackend, input: CycleInput): Promise<CycleOutcome> {
  const pendingSnapshot = pending(input.queue)
  const pendingIds = new Set(pendingSnapshot.map((e) => e.op.id))

  // 1. PULL first. Idempotent until the caller commits, so discarding it on a later failure is safe.
  const pull = await syncPull(backend, input.cursor, input.snapshot, input.revs, pendingIds)
  if (!pull.ok) return { ok: false, error: pull.error }

  // 2. Don't re-push an edit the pull already superseded (server won) — it would only re-conflict.
  const supersededIds = new Set(pull.conflicts.map((c) => c.id))
  const toPush = pendingSnapshot.filter((e) => !supersededIds.has(e.op.id))

  // 3. PUSH the rest. A transport failure discards the (idempotent) pull — re-pull next cycle.
  const push = await syncPush(backend, toPush)
  if (!push.ok) return { ok: false, error: push.error }

  // 4. ACK against the LIVE queue: every start-of-cycle pending entry was resolved this cycle (pushed
  //    or superseded), so drop each whose seq is unchanged; a mid-push re-edit (bumped seq) survives.
  const live = input.liveQueue ? input.liveQueue() : input.queue
  const queue = ack(live, pendingSnapshot)

  const stillDirty = new Set(queue.keys())

  // 5. Fold push outcomes into the rev map / conflicts / commit set, ack-GATED — apply a result only
  //    when its (id, seq) is still the live entry (else a mid-push re-edit wins). Push revs override the
  //    pull's view (newer server rev); a push CONFLICT's server winner must ALSO be committed (it is
  //    not in the pulled resolved set), or the store would keep the losing local value while the rev
  //    map says it's at the server rev.
  const revUpdates: Record<string, number> = { ...pull.revUpdates }
  const conflicts: Conflict[] = [...pull.conflicts]
  const conflictWinners: SyncEntity[] = []
  const pushConflictIds = new Set<string>()
  for (const p of push.pushed) {
    if (live.get(p.entry.op.id)?.seq !== p.entry.seq) continue // superseded by a mid-push edit → gate
    if (p.status === 'applied') {
      revUpdates[p.entry.op.id] = p.rev
    } else {
      revUpdates[p.entry.op.id] = p.conflict.server.rev
      conflicts.push(p.conflict)
      conflictWinners.push(p.conflict.server)
      pushConflictIds.add(p.entry.op.id)
    }
  }

  // 6. A still-dirty id (re-edited or first-edited mid-cycle) keeps its LIVE store value: pin its rev to
  //    the surviving queued op's baseRev (never a pulled/server rev — that would break the invariant
  //    "a pending id's rev-map entry == its baseRev"), drop any now-stale conflict for it, and exclude
  //    it from the commit set so the newer local edit isn't clobbered (it re-pushes from the queue).
  for (const [id, entry] of queue) revUpdates[id] = entry.op.baseRev
  const liveConflicts = conflicts.filter((c) => !stillDirty.has(c.id))

  // 7. Commit set: server-authoritative changes to NON-dirty ids — the pulled resolved entities plus
  //    the push-conflict winners (which replace those ids' local value). The lifecycle reconciles this
  //    against the LIVE store atomically (WI-7b-vi-d).
  const apply = pull.resolved
    .filter((e) => !stillDirty.has(e.id) && !pushConflictIds.has(e.id))
    .concat(conflictWinners)

  return {
    ok: true,
    cursor: pull.cursor,
    revUpdates,
    queue,
    apply,
    conflicts: liveConflicts,
    status: liveConflicts.length > 0 ? 'conflict' : 'idle',
  }
}

// Purpose: the push half of one sync cycle (#9 WI-7b). Pushes the offline queue's pending ops and
// reports a PER-ENTRY outcome the orchestrator applies against its LIVE state:
//   • applied → the new server `rev` (the entity's next baseRev — a later edit to the same entity
//     MUST push from this rev, or it would false-conflict and, under v1 server-wins, drop that edit).
//   • conflict → the surfaced Conflict (local = the op we pushed at rev=baseRev; server = the
//     authoritative winner). v1 is server-wins (review/restore deferred).
// Each result is tied to its QueueEntry so the orchestrator can ACK it against the live queue and
// apply the result ONLY if that exact (id, seq) was still queued — an edit made DURING the in-flight
// push bumps the seq, so ack keeps the newer edit and the stale applied-rev / conflict-server is NOT
// applied over it. syncPush is pure-async (only side effect: backend.push); it never mutates the queue.

import type { SyncBackend } from './backend'
import type { QueueEntry } from './queue'
import type { Conflict, PushOp, SyncEntity, SyncError } from './types'

export type PushedEntry =
  | { entry: QueueEntry; status: 'applied'; rev: number }
  | { entry: QueueEntry; status: 'conflict'; conflict: Conflict }

export type PushOutcome = { ok: true; pushed: PushedEntry[] } | { ok: false; error: SyncError }

/** The local edit we tried to push, as a SyncEntity (rev = the baseRev it was based on). */
function opToEntity(o: PushOp): SyncEntity {
  return { type: o.type, id: o.id, payload: o.payload, updatedAt: o.updatedAt, deletedAt: o.deletedAt, rev: o.baseRev }
}

export async function syncPush(backend: SyncBackend, entries: readonly QueueEntry[]): Promise<PushOutcome> {
  if (entries.length === 0) return { ok: true, pushed: [] }
  const res = await backend.push(entries.map((e) => e.op))
  if (!res.ok) return { ok: false, error: res.error } // queue untouched; re-push next cycle

  const byId = new Map(res.value.map((r) => [r.id, r]))
  const pushed: PushedEntry[] = []
  for (const entry of entries) {
    const r = byId.get(entry.op.id)
    if (r === undefined) continue // no result for this op (backend broke its 1:1 contract) → leave queued
    if (r.status === 'applied') {
      pushed.push({ entry, status: 'applied', rev: r.rev })
    } else {
      pushed.push({
        entry,
        status: 'conflict',
        conflict: { type: r.server.type, id: r.server.id, local: opToEntity(entry.op), server: r.server },
      })
    }
  }
  return { ok: true, pushed }
}

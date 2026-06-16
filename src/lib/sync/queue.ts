// Purpose: the pure offline push-queue data structure (#9 WI-6). Local edits apply optimistically to
// the stores; this queue records the PushOp to send, keyed by entity id so rapid edits to the same
// entity COLLAPSE to a single latest op (idempotent — the server only needs the newest intended
// state). Each entry carries a monotonic `seq`; `ack` removes an entry only if its (id, seq) is
// unchanged since the pushed snapshot, so an edit made DURING an in-flight push is never lost. Pure +
// immutable; the async drain loop, debounce, and online/offline listeners are layered by the
// orchestrator (WI-7), which enforces single-in-flight (so a seq can't be reused mid-cycle).

import type { PushOp } from './types'

export interface QueueEntry {
  op: PushOp
  seq: number
}
export type PushQueue = ReadonlyMap<string, QueueEntry>

export function emptyQueue(): PushQueue {
  return new Map()
}

/** Replace the entry for `op.id` with the latest op + a bumped seq (rapid same-id edits collapse). */
export function enqueue(queue: PushQueue, op: PushOp): PushQueue {
  const existing = queue.get(op.id)
  const seq = existing === undefined ? 1 : existing.seq + 1
  const next = new Map(queue)
  next.set(op.id, { op, seq })
  return next
}

/** The entries to push, as a stable array. */
export function pending(queue: PushQueue): QueueEntry[] {
  return [...queue.values()]
}

/**
 * After pushing a `snapshot` of entries, drop each one whose (id, seq) is STILL current — i.e. not
 * superseded by a newer enqueue during the in-flight push. A mid-flight edit (higher seq) stays
 * queued; an entry already removed is skipped. Relies on the orchestrator's single-in-flight drain.
 */
export function ack(queue: PushQueue, snapshot: readonly QueueEntry[]): PushQueue {
  const next = new Map(queue)
  for (const entry of snapshot) {
    const current = next.get(entry.op.id)
    if (current !== undefined && current.seq === entry.seq) next.delete(entry.op.id)
  }
  return next
}

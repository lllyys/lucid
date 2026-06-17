// Purpose: the DELTA projection (#9 WI-7b-vi-d) — diff two consecutive local snapshots into the PushOps
// to enqueue. The orchestrator's store subscription (WI-7b-vi-d) calls this on every domain-store change
// while sync is active; the resulting ops feed the offline queue. Pure + no I/O (the deletion timestamp
// `now` is injected), so it is deterministic and trivially testable.
//
// The domain stores HARD-DELETE (filter the entity out) rather than tombstone in place, so a delete
// shows up here as an entity present in `prev` but absent from `next`; we SYNTHESIZE a tombstone op for
// it (delete-wins on the server). An entity that was ALREADY tombstoned and then vanished is a GC of a
// prior tombstone, not a new delete, so it produces nothing. (Disconnect purges the server — WI-7b-vi-d
// — so a delete made while fully disconnected can't resurrect on reconnect; only connected edits diff
// here, and those are captured the instant they happen, even when the network is offline.)
//
// Change detection compares `updatedAt` + `deletedAt` + payload. Payload is compared (not just
// updatedAt) because the stores stamp updatedAt from a millisecond clock, so two rapid same-ms edits
// could share an updatedAt — payload equality still catches them. `updatedAt` is ALSO compared so an
// envelope-only change syncs: e.g. `addTask` bumps the parent session's `updatedAt` while its payload
// (`{name, createdAt}`) is unchanged — without the updatedAt check that "last activity" bump would
// never reach the server or other devices. `baseRev` for each op is the entity's last-synced rev from
// the rev map (0 = expect-new), preserving the invariant that a queued op's baseRev equals the rev-map
// entry for its id.

import { flattenLocal } from './seed'
import type { FlatEntity, LocalSnapshot } from './seed'
import type { PushOp } from './types'

const sameContent = (a: FlatEntity, b: FlatEntity): boolean =>
  a.updatedAt === b.updatedAt && a.deletedAt === b.deletedAt && JSON.stringify(a.payload) === JSON.stringify(b.payload)

export function diffToOps(
  prev: LocalSnapshot,
  next: LocalSnapshot,
  revs: ReadonlyMap<string, number>,
  now: number,
): PushOp[] {
  const prevById = new Map(flattenLocal(prev).map((e) => [e.id, e]))
  const nextFlat = flattenLocal(next)
  const nextIds = new Set(nextFlat.map((e) => e.id))
  const ops: PushOp[] = []

  // Added or content-changed entities → push the current value at its last-synced baseRev.
  for (const e of nextFlat) {
    const before = prevById.get(e.id)
    if (before === undefined || !sameContent(before, e)) {
      ops.push({ ...e, baseRev: revs.get(e.id) ?? 0 })
    }
  }

  // Vanished LIVE entities (hard-deleted) → synthesize a tombstone. A vanished already-tombstoned entity
  // is a GC of a prior tombstone (already pushed when first deleted) → skip.
  for (const e of prevById.values()) {
    if (!nextIds.has(e.id) && e.deletedAt === null) {
      ops.push({ type: e.type, id: e.id, payload: e.payload, updatedAt: now, deletedAt: now, baseRev: revs.get(e.id) ?? 0 })
    }
  }

  return ops
}

// Purpose: the pure conflict-resolution heart of the sync layer (#9). Given the client's `local`
// entities and a batch of `remote` entities just pulled from the server, reconcile them into a
// resolved set + a list of superseded-local-edit conflicts. The SERVER-assigned `rev` is the
// ordering authority (clock-skew-proof, validated by the Phase-0 spike): a remote whose rev advanced
// past a local entity's last-synced rev wins, regardless of either side's `updatedAt`. No clock
// reads, no I/O — deterministic and order-independent so it is trivially testable (rule 66 §4).

import type { Conflict, MergeResult, SyncEntity } from './types'

/**
 * Reconcile pulled `remote` entities against `local`. `pending` is the set of ids that have un-pushed
 * local edits ("dirty"). Per id:
 * - only local → keep local (unsynced-new, or unchanged since the cursor).
 * - only remote → adopt remote (new from the server).
 * - both, NOT pending → adopt remote (no local edit at risk; the server is authoritative).
 * - both, pending, `remote.rev > local.rev` → the local edit was SUPERSEDED: remote wins and a
 *   conflict is recorded (the surfaced v1 signal). Delete-wins falls out of this — a remote tombstone
 *   at a higher rev wins like any other write.
 * - both, pending, `remote.rev <= local.rev` → the pull is not newer than the local edit's base, so
 *   keep the pending local edit (it will be pushed).
 */
export function mergeEntities(
  local: readonly SyncEntity[],
  remote: readonly SyncEntity[],
  pending: ReadonlySet<string>,
): MergeResult {
  const localById = new Map(local.map((e) => [e.id, e]))
  // Normalize remote by id, keeping the HIGHEST rev. A well-behaved server never sends duplicate ids,
  // but a malformed batch must not let a stale duplicate mask a real supersession (and the result must
  // be order-independent) — so we resolve duplicates to the authoritative (max-rev) row up front.
  const remoteById = new Map<string, SyncEntity>()
  for (const r of remote) {
    const existing = remoteById.get(r.id)
    if (existing === undefined || r.rev > existing.rev) remoteById.set(r.id, r)
  }
  const resolved: SyncEntity[] = []
  const conflicts: Conflict[] = []

  for (const l of local) {
    const r = remoteById.get(l.id)
    if (r === undefined) {
      resolved.push(l) // local-only
    } else if (!pending.has(l.id)) {
      resolved.push(r) // server authoritative — no pending local edit at risk
    } else if (r.rev > l.rev) {
      resolved.push(r) // pending local edit superseded by an advanced remote
      conflicts.push({ type: l.type, id: l.id, local: l, server: r })
    } else {
      resolved.push(l) // pending edit's base is still current — keep it
    }
  }
  for (const r of remoteById.values()) {
    if (!localById.has(r.id)) resolved.push(r) // remote-only — new from the server
  }
  return { resolved, conflicts }
}

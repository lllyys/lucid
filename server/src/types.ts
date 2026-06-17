// Purpose: the wire/domain types for the self-hosted sync server (#9, WI-8b). These are DUPLICATED
// from the client contract (src/lib/sync/types.ts) on purpose — the server is a separate deployable
// package and must not import client code. The server treats `payload` as OPAQUE domain JSON it never
// interprets: it stores it verbatim and hands it back. The SERVER-assigned `rev` is the monotonic
// ordering authority (clock-skew-proof); `updatedAt` is client metadata/tiebreaker, never the winner.

/**
 * The kinds of entity that sync. The server never branches on this value — it is stored and echoed
 * verbatim alongside the opaque payload.
 */
export type EntityType = 'session' | 'task' | 'term' | 'keyword'

/**
 * A syncable entity as stored on the server and returned to the client. `rev` is the server-assigned
 * monotonic revision (>= 1). `deletedAt` is the tombstone (null = live); a delete is just a normal
 * write with `deletedAt` set — the store never special-cases tombstones (only `purge()` hard-deletes).
 */
export interface SyncEntity {
  type: EntityType
  id: string
  payload: Record<string, unknown>
  updatedAt: number
  deletedAt: number | null
  rev: number
}

/**
 * A change the client pushes. `baseRev` is the last server rev the client saw for this id (0 =
 * expect-new). The server applies the write only if its current row is still at `baseRev`; otherwise
 * it returns a conflict carrying the authoritative entity (optimistic concurrency).
 */
export interface PushOp {
  type: EntityType
  id: string
  payload: Record<string, unknown>
  updatedAt: number
  deletedAt: number | null
  baseRev: number
}

/**
 * Per-op push outcome. `applied` carries the new server `rev`; `conflict` carries the authoritative
 * `server` entity the client must reconcile against. A conflict is a normal outcome, not an error.
 */
export type PushResult =
  | { status: 'applied'; id: string; rev: number }
  | { status: 'conflict'; id: string; server: SyncEntity }

/** A pull returns entities changed since the client's cursor (`rev > since`) and the new cursor. */
export interface PullResult {
  changes: SyncEntity[]
  maxRev: number
}

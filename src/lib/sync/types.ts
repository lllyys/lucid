// Purpose: the wire/domain types for the self-hosted sync layer (#9). These mirror the shape the
// Phase-0 spike validated (dev-docs/grills/feature-9-sync/spike.mjs): every syncable entity is a
// {type,id,payload,updatedAt,deletedAt,rev} row whose SERVER-assigned `rev` is the ordering
// authority (clock-skew-proof). The sync/merge layer treats `payload` as opaque domain JSON — each
// store maps its own entity to/from it. No vendor types, no zod (hand-written guards live in
// ./guards) — the client stays dependency-free (review Medium #10).

/**
 * The kinds of entity that sync. Tasks sync as their OWN entities (their payload carries `sessionId`)
 * rather than embedded in a session blob, so a task edit never triggers whole-session LWW.
 */
export type EntityType = 'session' | 'task' | 'term' | 'keyword' | 'starred'

/**
 * A syncable entity in transit (and as stored on the server). `rev` is the server-assigned monotonic
 * revision — the PRIMARY ordering authority; a skewed client clock can only affect `updatedAt`, which
 * is metadata/tiebreaker, never the winner. `deletedAt` is the tombstone (null = live). `payload` is
 * the opaque domain JSON the owning store serialises (e.g. a session's name, a keyword's value).
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
 * A local change the client pushes. `baseRev` is the rev the client last saw for this id (0 =
 * expect-new). The server applies the write only if its row is still at `baseRev`; otherwise it
 * returns a conflict carrying the authoritative entity (optimistic concurrency — see the spike).
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
 * Per-op push outcome. `applied` carries the new server `rev` (the client adopts it as its next
 * baseRev); `conflict` carries the authoritative `server` entity the client must reconcile against
 * (re-pull → re-merge → re-push). A conflict is a normal sync outcome, not a SyncError.
 */
export type PushResult =
  | { status: 'applied'; id: string; rev: number }
  | { status: 'conflict'; id: string; server: SyncEntity }

/** A pull returns the entities changed since the client's cursor (`rev > since`) and the new cursor. */
export interface PullResult {
  changes: SyncEntity[]
  maxRev: number
}

/**
 * Transport/auth failures, mapped to localized UI (error.syncUnreachable / syncAuth / syncConflict —
 * headless-only until WI-9, rule 51). Distinct from a push `conflict`, which is a normal outcome.
 */
export type SyncError =
  | { kind: 'unreachable'; detail?: string } // network down / 5xx / timeout — server unavailable
  | { kind: 'auth'; detail?: string } // 401/403 — missing/expired/invalid token
  | { kind: 'badRequest'; detail?: string } // other 4xx / malformed response

/**
 * A merge conflict: a pending local edit the merge superseded because the server (authoritative by
 * `rev`) had a newer version. v1 surfaces this as a signal only — side-by-side review/restore is a
 * later release (the design's "review deferred" note). `local` is the superseded edit; `server` won.
 */
export interface Conflict {
  type: EntityType
  id: string
  local: SyncEntity
  server: SyncEntity
}

/** `mergeEntities` output: the reconciled entity set + any superseded-local-edit conflicts. */
export interface MergeResult {
  resolved: SyncEntity[]
  conflicts: Conflict[]
}

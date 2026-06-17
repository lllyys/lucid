// Purpose: the durable SQLite store the lucid web client syncs against (#9, WI-8b). Single-tenant —
// the whole DB is one user's data, so there is no owner column. The store is the SERVER-side half of
// the optimistic-concurrency contract: a push carries `baseRev` (the rev the client last saw) and the
// store applies the write only if its current row is still at that rev, allocating a fresh monotonic
// `rev` (the ordering authority) on apply and returning the authoritative entity on conflict.
//
// Pipeline: HTTP route (WI-8c, not in scope here) → applyOps / changesSince / purge → node:sqlite.
// Payload is OPAQUE domain JSON: stored as JSON.stringify, returned as JSON.parse, never interpreted.
// node:sqlite (Node >= 22) is the only DB dependency — no better-sqlite3.

import { DatabaseSync } from 'node:sqlite'
import type { EntityType, PullResult, PushOp, PushResult, SyncEntity } from './types.js'

export interface SyncStore {
  /** Apply a whole push batch atomically; one result per op, by id, in order. */
  applyOps(ops: PushOp[]): PushResult[]
  /** Entities with `rev > since`, ordered by rev ASC, plus the new cursor. */
  changesSince(since: number): PullResult
  /** Hard-delete every row (disconnect-and-erase). */
  purge(): void
  /** Close the underlying DB handle. */
  close(): void
}

/** The raw column shape a SELECT * returns; payload is the JSON string, deletedAt is null|number. */
interface EntityRow {
  id: string
  type: string
  payload: string
  updatedAt: number
  deletedAt: number | null
  rev: number
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER,
    rev INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entities_rev ON entities (rev);
`

const VALID_TYPES: ReadonlySet<string> = new Set<EntityType>(['session', 'task', 'term', 'keyword'])

/** Non-negative safe integer — mirrors the client's wire guard (src/lib/sync/guards.ts isNonNegInt). */
function isNonNegInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Reject a malformed op BEFORE it can be stored. The store is the untrusted SERVER boundary (the HTTP
 * layer, WI-8c, parses arbitrary JSON), so it must enforce its own input contract: a value the store
 * persists is later re-emitted on the conflict path as a `server` SyncEntity, and the client validates
 * every response with isSyncEntity (non-negative safe-int updatedAt/deletedAt, known type, object
 * payload). If the store accepted e.g. `updatedAt: -1`, a later conflict would emit an entity the
 * client guard REJECTS, mismapping a real conflict to `badRequest`. Throwing rejects the whole batch
 * atomically (before BEGIN); WI-8c maps the throw to HTTP 400.
 */
function assertValidOp(op: PushOp): void {
  const ok =
    typeof op === 'object' &&
    op !== null &&
    VALID_TYPES.has(op.type) &&
    typeof op.id === 'string' &&
    typeof op.payload === 'object' &&
    op.payload !== null &&
    !Array.isArray(op.payload) &&
    isNonNegInt(op.updatedAt) &&
    (op.deletedAt === null || isNonNegInt(op.deletedAt)) &&
    isNonNegInt(op.baseRev)
  if (!ok) throw new Error(`invalid push op${typeof op?.id === 'string' ? ` for id ${op.id}` : ''}`)
}

/** Coerce a possibly-bigint SQLite integer column to a JS number. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  throw new Error(`expected an integer column, got ${typeof value}`)
}

/** Narrow a raw node:sqlite row (Record<string, SQLOutputValue> | undefined) into a typed EntityRow. */
function asEntityRow(raw: Record<string, unknown> | undefined): EntityRow | undefined {
  if (raw === undefined) return undefined
  const { id, type, payload, updatedAt, deletedAt, rev } = raw
  if (typeof id !== 'string' || typeof type !== 'string' || typeof payload !== 'string') {
    throw new Error('corrupt entities row: id/type/payload must be strings')
  }
  return {
    id,
    type,
    payload,
    updatedAt: toNumber(updatedAt),
    deletedAt: deletedAt === null ? null : toNumber(deletedAt),
    rev: toNumber(rev),
  }
}

/** Map a stored row to the wire SyncEntity: JSON-parse the payload, validate the type. */
function rowToEntity(row: EntityRow): SyncEntity {
  const parsed: unknown = JSON.parse(row.payload)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`corrupt payload for entity ${row.id}: not a JSON object`)
  }
  if (!VALID_TYPES.has(row.type)) {
    throw new Error(`corrupt entities row ${row.id}: unknown type ${row.type}`)
  }
  return {
    type: row.type as EntityType,
    id: row.id,
    payload: parsed as Record<string, unknown>,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    rev: row.rev,
  }
}

export function createSyncStore(path = ':memory:'): SyncStore {
  const db = new DatabaseSync(path)
  db.exec(SCHEMA)

  const selectById = db.prepare('SELECT * FROM entities WHERE id = ?')
  const nextRevStmt = db.prepare('SELECT COALESCE(MAX(rev), 0) + 1 AS next FROM entities')
  const upsert = db.prepare(
    `INSERT INTO entities (id, type, payload, updatedAt, deletedAt, rev)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       payload = excluded.payload,
       updatedAt = excluded.updatedAt,
       deletedAt = excluded.deletedAt,
       rev = excluded.rev`,
  )
  const selectChanges = db.prepare('SELECT * FROM entities WHERE rev > ? ORDER BY rev ASC')
  const maxRevStmt = db.prepare('SELECT MAX(rev) AS max FROM entities')
  const deleteAll = db.prepare('DELETE FROM entities')

  function currentRow(id: string): EntityRow | undefined {
    return asEntityRow(selectById.get(id) as Record<string, unknown> | undefined)
  }

  function nextRev(): number {
    return toNumber((nextRevStmt.get() as Record<string, unknown>).next)
  }

  function applyOps(ops: PushOp[]): PushResult[] {
    if (ops.length === 0) return []
    for (const op of ops) assertValidOp(op) // reject a malformed batch before the txn (HTTP → 400); never store/echo a value the client guard would reject
    const results: PushResult[] = []
    // One transaction for the whole batch so rev allocation is atomic: either every applied op in the
    // batch lands with its allocated rev, or none does. BEGIN IMMEDIATE takes the write lock up front.
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const op of ops) {
        const current = currentRow(op.id)
        // Decision table:
        //  - no current row            → APPLY (create). Covers expect-new (baseRev 0) AND a stale
        //    baseRev>0 against a row the server no longer has (e.g. post-purge) — accept the data.
        //  - current row, rev === base → APPLY (update).
        //  - current row, rev !== base → CONFLICT (return the authoritative row, leave it unchanged).
        if (current === undefined || current.rev === op.baseRev) {
          const rev = nextRev() // re-evaluated per applied op → successive applies get 1,2,3,…
          upsert.run(
            op.id,
            op.type,
            JSON.stringify(op.payload),
            op.updatedAt,
            op.deletedAt, // a delete is just an UPSERT with deletedAt set — no tombstone special-casing
            rev,
          )
          results.push({ status: 'applied', id: op.id, rev })
        } else {
          results.push({ status: 'conflict', id: op.id, server: rowToEntity(current) })
        }
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    return results
  }

  function changesSince(since: number): PullResult {
    const rows = selectChanges.all(since) as Record<string, unknown>[]
    const changes = rows.map((raw) => {
      const row = asEntityRow(raw)
      if (row === undefined) throw new Error('unexpected empty row in changesSince')
      return rowToEntity(row)
    })
    const maxRaw = (maxRevStmt.get() as Record<string, unknown>).max
    // MAX(rev) over ALL rows; NULL (empty table) → never report below the requested cursor.
    const maxRev = maxRaw === null ? since : toNumber(maxRaw)
    return { changes, maxRev }
  }

  function purge(): void {
    deleteAll.run()
  }

  function close(): void {
    db.close()
  }

  return { applyOps, changesSince, purge, close }
}

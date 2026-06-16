// Purpose: hand-written runtime type guards for the sync layer's untrusted boundary (#9). The server
// response is parsed JSON — before the client trusts it as a SyncEntity / PullResult / PushResult it
// MUST be validated here (no zod; the client stays dependency-free, review Medium #10). Built on the
// shared `isRecord` primitive (src/lib/guards). The merge layer treats `payload` as opaque, so these
// validate the envelope, not the domain payload's inner shape.

import { isRecord } from '@/lib/guards'
import type { EntityType, PullResult, PushResult, SyncEntity } from './types'

const ENTITY_TYPES: readonly EntityType[] = ['session', 'task', 'term', 'keyword']

// Envelope numbers are integers, not arbitrary floats: timestamps + the cursor are non-negative
// (0 is valid — the legacy `updatedAt` sentinel and the initial pull cursor), and a SERVER-assigned
// `rev` is a positive monotonic counter (≥ 1). Tightening this keeps a malformed row (negative /
// fractional rev, NaN timestamp) from passing the untrusted boundary.
// Number.isSafeInteger (not isInteger): a rev/cursor above 2^53 has lost JSON precision, so two
// distinct server revs could compare equal — corrupting the ordering authority. Reject them.
const isNonNegInt = (v: unknown): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const isPosInt = (v: unknown): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1

// A domain payload is a plain object record — never an array (arrays pass isRecord, but a SyncEntity
// payload is always an object of entity fields; a `payload: []` would slip through and break a
// store's payload decoder downstream).
const isPayload = (v: unknown): v is Record<string, unknown> => isRecord(v) && !Array.isArray(v)

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v)
}

export function isSyncEntity(v: unknown): v is SyncEntity {
  return (
    isRecord(v) &&
    isEntityType(v.type) &&
    typeof v.id === 'string' &&
    isPayload(v.payload) &&
    isNonNegInt(v.updatedAt) &&
    (v.deletedAt === null || isNonNegInt(v.deletedAt)) &&
    isPosInt(v.rev)
  )
}

export function isPullResult(v: unknown): v is PullResult {
  return isRecord(v) && Array.isArray(v.changes) && v.changes.every(isSyncEntity) && isNonNegInt(v.maxRev)
}

export function isPushResult(v: unknown): v is PushResult {
  if (!isRecord(v) || typeof v.id !== 'string') return false
  if (v.status === 'applied') return isPosInt(v.rev)
  // A conflict must carry the authoritative entity for THIS id — else the client reconciles the
  // wrong entity. Guard the id match, not just the entity's well-formedness.
  if (v.status === 'conflict') return isSyncEntity(v.server) && v.server.id === v.id
  return false
}

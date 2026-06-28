// Purpose: the inverse of the local→sync projection (#9) — reconstruct domain store entities from
// merged SyncEntities so the orchestrator can apply pulled changes back into the stores. The sync
// envelope (id/updatedAt/deletedAt/rev) was already validated at the untrusted boundary (isSyncEntity,
// WI-2); the `payload` is opaque past that, so these reconstructors VALIDATE the domain fields and
// return null for a malformed payload — a non-string name/title/label/value would otherwise poison a
// store (e.g. crash `searchSessions`/`addTerm` `.toLowerCase()`), the same hazard the migrations guard.
// Pure; the envelope (updatedAt/deletedAt) rides from the entity, domain fields from the payload.

import type { Session, Task } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'
import type { StarredItem } from '@/stores/starredStore'
import { keywordId } from '@/lib/keywordId'
import { isNonNegInt } from '@/lib/guards'
import type { SyncEntity } from './types'

const isOptString = (v: unknown): v is string | undefined => v === undefined || typeof v === 'string'

/** Session with no tasks — the caller (reconcileStores) re-nests task entities by sessionId. */
export function entityToSession(e: SyncEntity): Session | null {
  const p = e.payload
  if (typeof p.name !== 'string' || !isNonNegInt(p.createdAt)) return null
  return { id: e.id, name: p.name, createdAt: p.createdAt, updatedAt: e.updatedAt, deletedAt: e.deletedAt, tasks: [] }
}

/** A Task plus the `sessionId` it nests under (tasks sync as their own entities). */
export function entityToTask(e: SyncEntity): { task: Task; sessionId: string } | null {
  const p = e.payload
  if (
    (p.kind !== 'translate' && p.kind !== 'polish') ||
    typeof p.title !== 'string' ||
    typeof p.sourceText !== 'string' ||
    typeof p.resultText !== 'string' ||
    typeof p.sessionId !== 'string' ||
    p.sessionId === '' || // a task must nest under a real session id
    !isNonNegInt(p.createdAt)
  ) {
    return null
  }
  return {
    task: {
      id: e.id,
      kind: p.kind,
      title: p.title,
      sourceText: p.sourceText,
      resultText: p.resultText,
      createdAt: p.createdAt,
      updatedAt: e.updatedAt,
      deletedAt: e.deletedAt,
    },
    sessionId: p.sessionId,
  }
}

export function entityToTerm(e: SyncEntity): Term | null {
  const p = e.payload
  // An untrimmed/empty label is type-valid and non-crashing; the server is authoritative for synced
  // terms, so we don't re-impose addTerm's create-time trim/dedup invariants here (that would drop
  // server data). createdAt is validated as a real timestamp.
  if (typeof p.label !== 'string' || !isNonNegInt(p.createdAt)) return null
  return { id: e.id, label: p.label, createdAt: p.createdAt, updatedAt: e.updatedAt, deletedAt: e.deletedAt }
}

/**
 * Reconstruct a StarredItem (feature #22). Follows the TERM path — NOT the keyword path: the id is a
 * random uuid (content-scan dedupe in the store), so there is NO id-derivation check here. Required
 * fields (kind/source/translation/langs/createdAt) are validated; the optional ipa/meaning/context must
 * each be a string when present (a non-string would survive into the store and could later crash a
 * `.toLowerCase()` search). Envelope (updatedAt/deletedAt) rides from the entity.
 */
export function entityToStarred(e: SyncEntity): StarredItem | null {
  const p = e.payload
  if (
    (p.kind !== 'word' && p.kind !== 'sentence') ||
    typeof p.source !== 'string' ||
    typeof p.translation !== 'string' ||
    typeof p.sourceLang !== 'string' ||
    typeof p.targetLang !== 'string' ||
    !isNonNegInt(p.createdAt) ||
    !isOptString(p.ipa) ||
    !isOptString(p.meaning) ||
    !isOptString(p.context)
  ) {
    return null
  }
  return {
    id: e.id,
    kind: p.kind,
    source: p.source,
    translation: p.translation,
    ipa: p.ipa,
    meaning: p.meaning,
    sourceLang: p.sourceLang,
    targetLang: p.targetLang,
    context: p.context,
    createdAt: p.createdAt,
    updatedAt: e.updatedAt,
    deletedAt: e.deletedAt,
  }
}

export function entityToKeyword(e: SyncEntity): Keyword | null {
  const p = e.payload
  // A keyword's identity IS its value (id = keywordId(value), WI-1c) — that's what makes the same
  // keyword on two devices converge. Reject a non-empty value whose id doesn't match, else the store
  // would hold an inconsistent id/value pair that breaks dedup/convergence.
  if (typeof p.value !== 'string' || p.value === '' || e.id !== keywordId(p.value)) return null
  return { id: e.id, value: p.value, updatedAt: e.updatedAt, deletedAt: e.deletedAt }
}

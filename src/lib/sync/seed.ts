// Purpose: the pure local-stores → sync projection (#9). One flattener feeds two consumers:
//   • buildSeedFromLocal — the consent-gated initial seed (each entity → a PushOp at baseRev 0, so
//     the orchestrator's idempotent UPSERT seed re-runs as a no-op on stable ids; crash-mid-seed safe).
//   • collectLocal — the per-cycle merge input (each entity → a SyncEntity carrying its last-synced
//     `rev`, looked up from the orchestrator's rev map; 0 = never synced).
// Both share `flattenLocal`, which decomposes the stores identically: a Session becomes one `session`
// entity (payload drops the embedded `tasks`) plus one `task` entity per task, keyed by `sessionId` in
// its payload — so tasks sync as their OWN entities (no whole-session LWW). The envelope
// (updatedAt/deletedAt) rides at the top level; the payload carries only the domain fields the server
// persists. Pure + no I/O; the store→sync projection is one-way (type-only imports; stores never
// import sync).

import type { Session } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'
import type { StarredItem } from '@/stores/starredStore'
import type { PushOp, SyncEntity } from './types'

export interface LocalSnapshot {
  sessions: readonly Session[]
  terms: readonly Term[]
  keywords: readonly Keyword[]
  starred: readonly StarredItem[]
}

/** The shared core of a projected entity — a SyncEntity without the `rev`/`baseRev` wrapper. */
export type FlatEntity = Pick<SyncEntity, 'type' | 'id' | 'payload' | 'updatedAt' | 'deletedAt'>

export function flattenLocal(snapshot: LocalSnapshot): FlatEntity[] {
  const out: FlatEntity[] = []
  for (const s of snapshot.sessions) {
    out.push({
      type: 'session',
      id: s.id,
      payload: { name: s.name, createdAt: s.createdAt },
      updatedAt: s.updatedAt,
      deletedAt: s.deletedAt,
    })
    for (const t of s.tasks) {
      out.push({
        type: 'task',
        id: t.id,
        payload: {
          kind: t.kind,
          title: t.title,
          sourceText: t.sourceText,
          resultText: t.resultText,
          sessionId: s.id,
          createdAt: t.createdAt,
        },
        updatedAt: t.updatedAt,
        deletedAt: t.deletedAt,
      })
    }
  }
  for (const term of snapshot.terms) {
    out.push({
      type: 'term',
      id: term.id,
      payload: { label: term.label, createdAt: term.createdAt },
      updatedAt: term.updatedAt,
      deletedAt: term.deletedAt,
    })
  }
  for (const k of snapshot.keywords) {
    out.push({ type: 'keyword', id: k.id, payload: { value: k.value }, updatedAt: k.updatedAt, deletedAt: k.deletedAt })
  }
  for (const item of snapshot.starred) {
    out.push({
      type: 'starred',
      id: item.id,
      payload: {
        kind: item.kind,
        source: item.source,
        translation: item.translation,
        ipa: item.ipa,
        meaning: item.meaning,
        sourceLang: item.sourceLang,
        targetLang: item.targetLang,
        context: item.context,
        createdAt: item.createdAt,
      },
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
    })
  }
  return out
}

/** Consent-gated initial seed: every local entity as an expect-new (`baseRev: 0`) PushOp. */
export function buildSeedFromLocal(snapshot: LocalSnapshot): PushOp[] {
  return flattenLocal(snapshot).map((e) => ({ ...e, baseRev: 0 }))
}

/** Per-cycle merge input: every local entity as a SyncEntity stamped with its last-synced `rev`
 *  (from the orchestrator's rev map; `0` when the entity has never synced). */
export function collectLocal(snapshot: LocalSnapshot, revs: ReadonlyMap<string, number>): SyncEntity[] {
  return flattenLocal(snapshot).map((e) => ({ ...e, rev: revs.get(e.id) ?? 0 }))
}

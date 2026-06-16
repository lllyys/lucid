// Purpose: the pure localStorage→server seed builder (#9 WI-5). Consent-gated migration starts here:
// when the user opts in, `buildSeedFromLocal` projects the current local stores into a flat list of
// PushOps (each `baseRev: 0` = expect-new) that the orchestrator (WI-7) pushes through the idempotent
// UPSERT path — stable ids mean a re-run (crash-mid-seed) is a no-op, not a duplicate. Pure + no I/O,
// so it is trivially testable; nothing here transmits anything (the orchestrator decides when/if).
//
// Sessions are flattened: a Session becomes one `session` op (its payload drops the embedded `tasks`)
// plus one `task` op per task, each keyed by `sessionId` in its payload — tasks sync as their OWN
// entities so a task edit never causes whole-session LWW. The sync envelope (updatedAt/deletedAt)
// rides at the op top level; the payload carries only the domain fields the server must persist.

import type { Session } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'
import type { PushOp } from './types'

export interface LocalSnapshot {
  sessions: readonly Session[]
  terms: readonly Term[]
  keywords: readonly Keyword[]
}

export function buildSeedFromLocal(snapshot: LocalSnapshot): PushOp[] {
  const ops: PushOp[] = []
  for (const s of snapshot.sessions) {
    ops.push({
      type: 'session',
      id: s.id,
      payload: { name: s.name, createdAt: s.createdAt },
      updatedAt: s.updatedAt,
      deletedAt: s.deletedAt,
      baseRev: 0,
    })
    for (const t of s.tasks) {
      ops.push({
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
        baseRev: 0,
      })
    }
  }
  for (const term of snapshot.terms) {
    ops.push({
      type: 'term',
      id: term.id,
      payload: { label: term.label, createdAt: term.createdAt },
      updatedAt: term.updatedAt,
      deletedAt: term.deletedAt,
      baseRev: 0,
    })
  }
  for (const k of snapshot.keywords) {
    ops.push({
      type: 'keyword',
      id: k.id,
      payload: { value: k.value },
      updatedAt: k.updatedAt,
      deletedAt: k.deletedAt,
      baseRev: 0,
    })
  }
  return ops
}

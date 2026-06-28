// Purpose: apply a merged set of SyncEntities back into local store state (#9 WI-7b). The orchestrator
// reads the current snapshot, runs the merge (WI-3), then calls this to compute the next snapshot it
// writes to the stores. Pure: no I/O, no store access — it takes `current` and returns the new arrays.
//
// Two passes so the result is independent of `resolved` order: pass 1 applies sessions/terms/keywords;
// pass 2 applies tasks, nesting each into its (now-applied) session. A DELETE acts on the envelope id
// ALONE — a tombstone's payload may be empty/minimal, so we must NOT gate deletion behind payload
// reconstruction (that would leave stale entities live, violating delete-wins). Reconstruction (and its
// payload validation) applies only to LIVE upserts. Upserting a session preserves its current tasks
// (the session payload carries none; tasks sync as their own entities); a task whose session is absent
// (never synced, or tombstoned in pass 1) is dropped, never orphaned.

import { entityToSession, entityToTask, entityToTerm, entityToKeyword, entityToStarred } from './reconstruct'
import type { LocalSnapshot } from './seed'
import type { Session } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'
import type { StarredItem } from '@/stores/starredStore'
import type { SyncEntity } from './types'

export function reconcileStores(
  current: LocalSnapshot,
  resolved: readonly SyncEntity[],
): { sessions: Session[]; terms: Term[]; keywords: Keyword[]; starred: StarredItem[] } {
  const sessions = new Map<string, Session>(current.sessions.map((s) => [s.id, { ...s, tasks: [...s.tasks] }]))
  const terms = new Map<string, Term>(current.terms.map((t) => [t.id, t]))
  const keywords = new Map<string, Keyword>(current.keywords.map((k) => [k.id, k]))
  const starred = new Map<string, StarredItem>(current.starred.map((i) => [i.id, i]))

  for (const e of resolved) {
    if (e.type === 'session') {
      if (e.deletedAt !== null) {
        sessions.delete(e.id) // delete-wins: id is enough, payload may be empty
        continue
      }
      const s = entityToSession(e)
      if (s === null) continue
      const existing = sessions.get(e.id)
      sessions.set(e.id, existing === undefined ? s : { ...s, tasks: existing.tasks }) // preserve tasks
    } else if (e.type === 'term') {
      if (e.deletedAt !== null) {
        terms.delete(e.id)
        continue
      }
      const t = entityToTerm(e)
      if (t !== null) terms.set(e.id, t)
    } else if (e.type === 'keyword') {
      if (e.deletedAt !== null) {
        keywords.delete(e.id)
        continue
      }
      const k = entityToKeyword(e)
      if (k !== null) keywords.set(e.id, k)
    } else if (e.type === 'starred') {
      if (e.deletedAt !== null) {
        starred.delete(e.id)
        continue
      }
      const item = entityToStarred(e)
      if (item !== null) starred.set(e.id, item)
    }
  }

  for (const e of resolved) {
    if (e.type !== 'task') continue
    if (e.deletedAt !== null) {
      // delete-wins: remove the task id from whichever session holds it (id alone; no payload needed)
      for (const [sid, sess] of sessions) {
        if (sess.tasks.some((t) => t.id === e.id)) {
          sessions.set(sid, { ...sess, tasks: sess.tasks.filter((t) => t.id !== e.id) })
        }
      }
      continue
    }
    const r = entityToTask(e)
    if (r === null) continue
    const parent = sessions.get(r.sessionId)
    if (parent === undefined) continue // orphan: no session to nest into
    sessions.set(r.sessionId, { ...parent, tasks: [...parent.tasks.filter((t) => t.id !== e.id), r.task] })
  }

  return {
    sessions: [...sessions.values()],
    terms: [...terms.values()],
    keywords: [...keywords.values()],
    starred: [...starred.values()],
  }
}

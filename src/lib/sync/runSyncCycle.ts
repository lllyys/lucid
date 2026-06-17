// Purpose: run ONE sync cycle against the LIVE stores (#9 WI-7b-vi-d) — the impure orchestrator
// boundary that wires the pure engine (runCycle) to the app's zustand stores. Reads the current cursor
// / rev map / local snapshot / queue, runs the engine, and COMMITS the outcome: reconcile the server
// changes into the domain stores (under the echo guard so the commit isn't re-enqueued as a local
// edit), fold revUpdates into the rev map, advance the cursor, ack the resolved queue entries, and
// reflect status / conflict / counts. On a transport failure it maps the SyncError to a status and
// commits nothing else. The lifecycle (debounce, online/offline, opt-in gate, the edit subscription)
// is layered on top by the orchestrator (next slice); this is the single "do one cycle now" primitive.
// Unlike the pure primitives in this dir, it deliberately imports the stores — it is the seam where the
// pure sync logic meets app state. Tests inject a mock `backend` (the network boundary) and assert
// against the real stores.

import { runCycle } from './cycle'
import { reconcileStores } from './reconcile'
import { runSuppressed } from './applyGuard'
import type { SyncBackend } from './backend'
import type { PushQueue, QueueEntry } from './queue'
import type { SyncError } from './types'
import { useSyncStore, type SyncStatus } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'

const toMap = (entries: readonly QueueEntry[]): PushQueue => new Map(entries.map((e) => [e.op.id, e]))

const readSnapshot = () => ({
  sessions: useSessionStore.getState().sessions,
  terms: useGlossaryStore.getState().terms,
  keywords: usePolishKeywordsStore.getState().keywords,
})

/** Map a transport SyncError to the design's status. (`offline` is navigator-offline, set by the lifecycle.) */
function errorStatus(error: SyncError): SyncStatus {
  if (error.kind === 'auth') return 'auth-error'
  return 'unreachable' // unreachable | badRequest both surface as "can't reach the server"
}

export async function runSyncCycle(backend: SyncBackend): Promise<void> {
  useSyncStore.getState().setStatus('syncing')

  const startEntries = useSyncQueueStore.getState().entries
  const outcome = await runCycle(backend, {
    cursor: useSyncStore.getState().cursor,
    revs: new Map(Object.entries(useSyncStore.getState().revs)),
    snapshot: readSnapshot(),
    queue: toMap(startEntries),
    liveQueue: () => toMap(useSyncQueueStore.getState().entries), // re-read for ack-gating
  })

  if (!outcome.ok) {
    useSyncStore.getState().setStatus(errorStatus(outcome.error))
    return
  }

  // Reconcile the server changes into the LIVE domain stores under the echo guard, so the edit
  // subscription doesn't treat these writes as new local edits. Reconcile against the CURRENT snapshot
  // (re-read here, not the start one) — `apply` already excludes ids dirtied mid-cycle, so a concurrent
  // local edit is preserved.
  const next = reconcileStores(readSnapshot(), outcome.apply)
  runSuppressed(() => {
    useSessionStore.setState({ sessions: next.sessions })
    useGlossaryStore.setState({ terms: next.terms })
    usePolishKeywordsStore.setState({ keywords: next.keywords })
  })

  const sync = useSyncStore.getState()
  sync.setRevs(outcome.revUpdates)
  sync.setCursor(outcome.cursor)
  useSyncQueueStore.getState().ack(startEntries) // drop the entries we resolved (seq-gated → mid-cycle edits survive)
  sync.setQueuedCount(useSyncQueueStore.getState().entries.length)
  sync.setCounts({
    sessions: next.sessions.length,
    tasks: next.sessions.reduce((n, s) => n + s.tasks.length, 0),
    terms: next.terms.length,
    keywords: next.keywords.length,
  })
  // status + conflict are kept consistent: a conflict cycle surfaces the latest conflict; a clean cycle
  // clears the signal. Project to the store's `SyncConflictInfo {type,id}` — NOT the full Conflict (its
  // local/server payloads aren't part of the v1 surfaced signal). The UI (WI-9) decides how to latch it.
  const lastConflict = outcome.conflicts.at(-1)
  sync.recordConflict(lastConflict ? { type: lastConflict.type, id: lastConflict.id } : null)
  sync.setStatus(outcome.status)
}

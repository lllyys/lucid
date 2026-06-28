// Purpose: observe local domain edits and project them into the offline push-queue (#9 WI-7b-vi-d) —
// the impure subscription half of the orchestrator. Subscribes to the three domain stores; on each
// change it diffs the current snapshot against a held baseline (diffToOps) and enqueues the resulting
// PushOps, then notifies `onEdit` so the orchestrator can schedule a drain.
//
// Echo guard: when the orchestrator COMMITS a pulled cycle it writes the domain stores under
// runSuppressed(), so the handler fires with isApplyingSync() === true. Those writes must NOT be
// re-enqueued as local edits — but the baseline MUST still advance to the committed state, or the next
// real edit would diff against stale data and re-enqueue the server's changes. So under the guard we
// update the baseline and return without enqueuing.

import { diffToOps } from './diff'
import { isApplyingSync } from './applyGuard'
import type { LocalSnapshot } from './seed'
import { useSyncStore } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'
import { useStarredStore } from '@/stores/starredStore'

export interface EditTrackerOptions {
  /** Clock for synthesized-tombstone timestamps (injected for deterministic tests). */
  now: () => number
  /** Called after one or more edits are enqueued — the orchestrator schedules a debounced drain. */
  onEdit: () => void
}

const snapshot = (): LocalSnapshot => ({
  sessions: useSessionStore.getState().sessions,
  terms: useGlossaryStore.getState().terms,
  keywords: usePolishKeywordsStore.getState().keywords,
  starred: useStarredStore.getState().items,
})

export function startEditTracking(opts: EditTrackerOptions): () => void {
  let baseline = snapshot()

  const handle = (): void => {
    const next = snapshot()
    if (isApplyingSync()) {
      baseline = next // absorb the orchestrator's own commit; do not re-enqueue it
      return
    }
    const revs = new Map(Object.entries(useSyncStore.getState().revs))
    const ops = diffToOps(baseline, next, revs, opts.now())
    baseline = next
    if (ops.length === 0) return
    for (const op of ops) useSyncQueueStore.getState().enqueue(op)
    useSyncStore.getState().setQueuedCount(useSyncQueueStore.getState().entries.length)
    opts.onEdit()
  }

  const unsubs = [
    useSessionStore.subscribe(handle),
    useGlossaryStore.subscribe(handle),
    usePolishKeywordsStore.subscribe(handle),
    useStarredStore.subscribe(handle),
  ]
  return () => unsubs.forEach((u) => u())
}

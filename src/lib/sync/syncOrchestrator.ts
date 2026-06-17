// Purpose: the sync orchestrator lifecycle (#9 WI-7b-vi-d-5) — the live loop that ties the edit tracker
// and the cycle primitive together. While connected it: tracks local edits (debounced → drain), polls
// periodically (so OTHER devices' changes arrive even with no local edit), drains on coming online, and
// runs at most ONE cycle at a time (single-in-flight; a trigger arriving mid-cycle reruns once after).
// Offline → marks the status and skips draining. An auth error pauses auto-draining (a 4xx won't fix
// itself — rule 65 §4); an unreachable error keeps polling (the server may recover). stop() fully tears
// down (tracker, poll, debounce, connectivity listeners), so disconnect leaves nothing running.
//
// Opt-in gate: the caller starts the orchestrator only when connected (a config + backend exist), and a
// defensive guard skips any drain if the config is cleared mid-flight. The seed-on-connect and
// purge-on-disconnect (WI-7b-vi-d-6) hook around start()/stop() without changing this loop.
//
// Timing / connectivity are injected so the loop is deterministic under vitest fake timers + a mock
// backend + the real stores; production uses the window/navigator defaults.

import { runSyncCycle } from './runSyncCycle'
import { startEditTracking } from './editTracker'
import type { SyncBackend } from './backend'
import { useSyncStore } from '@/stores/syncStore'

export interface SyncOrchestratorDeps {
  backend: SyncBackend
  now?: () => number
  /** Debounce window for coalescing rapid local edits before a drain. */
  debounceMs?: number
  /** Periodic pull cadence so remote changes arrive without a local edit. */
  pollMs?: number
  isOnline?: () => boolean
  /** Subscribe to connectivity changes; returns an unsubscribe. */
  subscribeConnectivity?: (onChange: () => void) => () => void
}

export interface SyncOrchestrator {
  start: () => void
  stop: () => void
  /**
   * Force an immediate sync cycle (the UI's "Sync now" / "Retry now"). Routes through the same
   * single-in-flight `requestDrain` as the automatic triggers, so it coalesces with an in-flight cycle
   * rather than overlapping. No-op when stopped, paused (auth-error — a 4xx won't fix itself), or offline
   * (sets the offline status instead, like the automatic path).
   */
  sync: () => void
}

const defaultSubscribeConnectivity = (onChange: () => void): (() => void) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function createSyncOrchestrator(deps: SyncOrchestratorDeps): SyncOrchestrator {
  const { backend } = deps
  const now = deps.now ?? Date.now
  const debounceMs = deps.debounceMs ?? 800
  const pollMs = deps.pollMs ?? 15_000
  const isOnline = deps.isOnline ?? (() => navigator.onLine)
  const subscribeConnectivity = deps.subscribeConnectivity ?? defaultSubscribeConnectivity

  let started = false
  let draining = false
  let rerun = false
  let paused = false // set on auth-error (don't auto-retry a 4xx); cleared by start()
  let epoch = 0 // bumped on every start()/stop(); a cycle commits only if its epoch is still current
  let editTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let stopTracker: (() => void) | undefined
  let stopConnectivity: (() => void) | undefined

  async function requestDrain(): Promise<void> {
    if (!started || paused) return
    if (useSyncStore.getState().config === null) return // never drain without a connection
    if (!isOnline()) {
      useSyncStore.getState().setStatus('offline')
      return
    }
    if (draining) {
      rerun = true // coalesce: run exactly one more cycle after the in-flight one
      return
    }
    draining = true
    // Capture this cycle's epoch; if stop()/restart bumps it (or the config is cleared) while the
    // backend I/O is in flight, the awaited cycle commits nothing — no stale write into a torn-down
    // or disconnected client.
    const myEpoch = epoch
    const live = () => myEpoch === epoch && useSyncStore.getState().config !== null
    try {
      await runSyncCycle(backend, live)
      if (!live()) return // stopped/disconnected mid-cycle — skip the post-cycle bookkeeping too
      const status = useSyncStore.getState().status
      if (status === 'auth-error') {
        paused = true // bad token — stop hammering; resumes on reconnect via start()
      } else if (status === 'idle' || status === 'conflict') {
        useSyncStore.getState().setLastSynced(now()) // a completed sync (clean or surfaced-conflict)
      }
      // 'unreachable' → keep polling (the server may recover); no lastSynced stamp.
      // If connectivity dropped DURING this cycle, the offline event already fired and set 'offline',
      // then the committed idle/conflict OR the 'unreachable' error overwrote it. Re-assert 'offline'
      // for those — navigator-offline is the more specific status and no further connectivity event is
      // guaranteed until a future poll, so it would not self-correct. (auth-error keeps its status: a
      // 401/403 means the server WAS reached, and it is a paused terminal state.)
      if (status !== 'auth-error' && !isOnline()) {
        useSyncStore.getState().setStatus('offline')
      }
    } finally {
      draining = false
      if (rerun && started && !paused) {
        rerun = false
        void requestDrain()
      }
    }
  }

  function onEdit(): void {
    if (editTimer) clearTimeout(editTimer)
    editTimer = setTimeout(() => {
      editTimer = undefined
      void requestDrain()
    }, debounceMs)
  }

  function onConnectivity(): void {
    if (isOnline()) void requestDrain() // came online → flush
    else useSyncStore.getState().setStatus('offline')
  }

  return {
    start() {
      if (started) return
      started = true
      paused = false
      rerun = false
      epoch += 1 // a fresh session: invalidate any cycle still in flight from a prior start
      stopTracker = startEditTracking({ now, onEdit })
      stopConnectivity = subscribeConnectivity(onConnectivity)
      pollTimer = setInterval(() => void requestDrain(), pollMs)
      void requestDrain() // initial pull on connect
    },
    stop() {
      if (!started) return
      started = false
      epoch += 1 // invalidate an in-flight cycle so its post-await commit is skipped
      stopTracker?.()
      stopTracker = undefined
      stopConnectivity?.()
      stopConnectivity = undefined
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = undefined
      }
      if (editTimer) {
        clearTimeout(editTimer)
        editTimer = undefined
      }
    },
    sync() {
      void requestDrain() // manual immediate trigger; requestDrain owns the started/paused/offline guards
    },
  }
}

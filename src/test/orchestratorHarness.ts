// Shared test harness for the sync orchestrator (#9 WI-7b-vi-d-5). Lives in src/test (the designated
// test-helper location) so the orchestrator's core + lifecycle specs share one setup. Injects
// deterministic timing/connectivity so the loop runs under vitest fake timers + a mock backend + the
// real stores.

import { vi } from 'vitest'
import { createSyncOrchestrator, type SyncOrchestrator } from '@/lib/sync/syncOrchestrator'
import type { SyncBackend, BackendResult } from '@/lib/sync/backend'
import type { PullResult, PushResult } from '@/lib/sync/types'
import { useSyncStore } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useGlossaryStore, type Term } from '@/stores/glossaryStore'
import { useSessionStore } from '@/stores/sessionStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'

export const NOW = 5000
export const term = (id: string, label: string): Term => ({ id, label, createdAt: 1, updatedAt: 1, deletedAt: null })

export const okBackend = (): SyncBackend => ({
  pull: vi.fn(() => Promise.resolve<BackendResult<PullResult>>({ ok: true, value: { changes: [], maxRev: 0 } })),
  push: vi.fn(() => Promise.resolve<BackendResult<PushResult[]>>({ ok: true, value: [] })),
  purge: vi.fn(),
})

export const errBackend = (kind: 'auth' | 'unreachable'): SyncBackend => ({
  pull: vi.fn(() => Promise.resolve<BackendResult<PullResult>>({ ok: false, error: { kind } })),
  push: vi.fn(() => Promise.resolve<BackendResult<PushResult[]>>({ ok: true, value: [] })),
  purge: vi.fn(),
})

/** A backend whose pull stays pending until `resolve()` is called — for in-flight / mid-cycle tests. */
export function deferredPullBackend(): { backend: SyncBackend; pull: SyncBackend['pull']; resolve: (v: BackendResult<PullResult>) => void } {
  let resolvePull: (v: BackendResult<PullResult>) => void = () => {}
  const pull = vi.fn(
    () =>
      new Promise<BackendResult<PullResult>>((res) => {
        resolvePull = res
      }),
  )
  const backend: SyncBackend = { pull, push: vi.fn(() => Promise.resolve<BackendResult<PushResult[]>>({ ok: true, value: [] })), purge: vi.fn() }
  return { backend, pull, resolve: (v) => resolvePull(v) }
}

export interface Harness {
  online: boolean
  conn?: () => void
}

export const makeOrchestrator = (backend: SyncBackend, h: Harness, extra: Record<string, unknown> = {}): SyncOrchestrator =>
  createSyncOrchestrator({
    backend,
    now: () => NOW,
    debounceMs: 100,
    pollMs: 1000,
    isOnline: () => h.online,
    subscribeConnectivity: (cb) => {
      h.conn = cb
      return () => {
        h.conn = undefined
      }
    },
    ...extra,
  })

/** Flush microtasks (the awaited backend promises) without advancing wall time. */
export const tick = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

export const connected = (): void => {
  useSyncStore.setState({ config: { serverUrl: 's', token: 't' } })
}

export const resetSyncStores = (): void => {
  useSessionStore.getState().reset()
  useGlossaryStore.getState().reset()
  usePolishKeywordsStore.getState().reset()
  useSyncStore.getState().reset()
  useSyncQueueStore.getState().reset()
}

// Purpose: the headless sync controller (#9 WI-7b-vi-d-6) — the top-level connect/resume/disconnect API
// the sync UI (WI-9) drives. It composes the orchestrator (WI-7b-vi-d-5) with the seed and the
// disconnect/purge flows:
//   • connect(config): store the config (resets cursor/seeded/revs for a fresh server), CLEAR the
//     persisted queue (stale ops from a prior server/session must not push to the new one), SEED the
//     current local data into the queue (the edit tracker only sees CHANGES after start, so pre-existing
//     entities must be uploaded here), then start the orchestrator. The seed is idempotent — every op is
//     expect-new (baseRev 0) on a stable id, so a re-connect/re-seed upserts rather than duplicates.
//   • resume(): re-attach an already-connected session after a reload — start the orchestrator WITHOUT
//     re-seeding (the persisted `seeded` flag is still true) and WITHOUT clearing the queue (its
//     un-pushed edits are still bound for the same server). No-op when local-only (no config).
//   • syncNow(): force an immediate sync cycle (the UI's "Sync now" / "Retry now") via the orchestrator's
//     single-in-flight drain. No-op when local-only/stopped.
//   • disconnect({ erase }): stop the orchestrator, optionally PURGE this client's data from the server,
//     clear the queue, and revert the store to local-only — the local domain data is always KEPT. With
//     erase:true (default) it purges (so a later reconnect re-seeds from scratch, preventing offline-delete
//     resurrection, see diff.ts) and returns whether the purge SUCCEEDED — a failed erase leaves server
//     data behind (a later reconnect could resurrect it), so the UI surfaces it. With erase:false (the
//     design's "Disconnect · keep server data · reconnect later to resume") it skips the purge and returns
//     true; a later reconnect re-seeds + rejoins the kept data.
//
// A controller `generation` guards the async disconnect tail: if a connect()/resume() starts a new
// session while disconnect() awaits a slow purge, the disconnect's post-purge local reset is skipped so
// it doesn't tear down the new session (the orchestrator's epoch guard is per-orchestrator and can't see
// this controller-level race).
//
// Injectable backend factory + orchestrator timing so it is unit-testable with a mock backend + fake
// timers; production builds the REST backend from the config.

import { createSyncOrchestrator, type SyncOrchestrator, type SyncOrchestratorDeps } from './syncOrchestrator'
import { buildSeedFromLocal } from './seed'
import { createRestSyncBackend, type SyncBackend } from './backend'
import { useSyncStore, type SyncConfig } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'

type OrchestratorTuning = Omit<SyncOrchestratorDeps, 'backend'>

export interface SyncControllerDeps extends OrchestratorTuning {
  /** Build a backend from the connection config (injected for tests; default = the REST backend). */
  createBackend?: (config: SyncConfig) => SyncBackend
}

export interface SyncController {
  connect: (config: SyncConfig) => void
  resume: () => void
  /** Force an immediate sync cycle (the UI's "Sync now" / "Retry now"). No-op when local-only/stopped. */
  syncNow: () => void
  /**
   * Stop syncing and revert to local-only (local domain data is always KEPT). `opts.erase` (default
   * true — the original purge-on-disconnect semantics) also PURGES this client's data from the server;
   * pass `erase: false` for the design's "Disconnect (keep server data) · reconnect later to resume".
   * Resolves to whether the purge SUCCEEDED — true when `erase: false` (nothing to purge); when erasing,
   * false means server data may persist (a later reconnect could resurrect it), so the UI surfaces it.
   */
  disconnect: (opts?: { erase?: boolean }) => Promise<boolean>
}

const snapshot = () => ({
  sessions: useSessionStore.getState().sessions,
  terms: useGlossaryStore.getState().terms,
  keywords: usePolishKeywordsStore.getState().keywords,
})

export function createSyncController(deps: SyncControllerDeps = {}): SyncController {
  const createBackend = deps.createBackend ?? ((c: SyncConfig) => createRestSyncBackend({ baseUrl: c.serverUrl, token: c.token }))
  const tuning: OrchestratorTuning = {
    now: deps.now,
    debounceMs: deps.debounceMs,
    pollMs: deps.pollMs,
    isOnline: deps.isOnline,
    subscribeConnectivity: deps.subscribeConnectivity,
  }
  let orchestrator: SyncOrchestrator | undefined
  let backend: SyncBackend | undefined
  let generation = 0 // bumped on every session transition; guards disconnect()'s async tail against a racing connect()

  function launch(config: SyncConfig): void {
    generation += 1
    orchestrator?.stop() // tear down any prior loop first (reconnect without an explicit disconnect)
    backend = createBackend(config)
    if (!useSyncStore.getState().seeded) {
      for (const op of buildSeedFromLocal(snapshot())) useSyncQueueStore.getState().enqueue(op)
      useSyncStore.getState().markSeeded()
      useSyncStore.getState().setQueuedCount(useSyncQueueStore.getState().entries.length)
    }
    orchestrator = createSyncOrchestrator({ backend, ...tuning })
    orchestrator.start()
  }

  return {
    connect(config) {
      useSyncStore.getState().connect(config) // sets config, resets cursor/seeded/revs → a fresh seed
      useSyncQueueStore.getState().reset() // drop stale ops from a prior server/session before re-seeding
      launch(config)
    },
    resume() {
      const config = useSyncStore.getState().config
      if (config === null) return // local-only — nothing to resume
      launch(config) // `seeded` persisted as true → launch() does not re-seed; the persisted queue is kept
    },
    syncNow() {
      orchestrator?.sync() // no-op when local-only/stopped (no orchestrator); the loop owns the rest
    },
    async disconnect(opts = {}) {
      const erase = opts.erase ?? true // default keeps the original purge-on-disconnect semantics
      const myGen = (generation += 1)
      orchestrator?.stop()
      orchestrator = undefined
      const b = backend
      backend = undefined
      // erase:false → "Disconnect (keep server data)": revert to local-only WITHOUT purging, so a later
      // reconnect re-seeds + rejoins the kept server data. erase:true → also purge (best-effort).
      const purged = erase && b ? (await b.purge()).ok : true // report success so the UI can surface a failed erase
      // A connect()/resume() during the awaited purge started a NEW session (bumped generation) — don't
      // let this stale tail reset it back to local-only.
      if (generation === myGen) {
        useSyncQueueStore.getState().reset()
        useSyncStore.getState().disconnect() // revert to local-only (local domain data is kept)
      }
      return purged
    },
  }
}

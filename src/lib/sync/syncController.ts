// Purpose: the headless sync controller (#9 WI-7b-vi-d-6) — the top-level connect/resume/disconnect API
// the sync UI (WI-9) drives. It composes the orchestrator (WI-7b-vi-d-5) with the seed and the
// disconnect/purge flows:
//   • connect(config): store the config (resets cursor/seeded/revs for a fresh server), CLEAR the
//     persisted queue (stale ops from a prior server/session must not push to the new one), SEED the
//     current local data into the queue (the edit tracker only sees CHANGES after start, so pre-existing
//     entities must be uploaded here), then start the orchestrator. The seed is idempotent — every op is
//     expect-new (baseRev 0) on a stable id, so a re-connect/re-seed upserts rather than duplicates.
//   • connectSingleOrigin(): connect token-free to the served origin (#19 WI-2) — same flow as
//     connect() but the config is window.location.origin + an empty token (no typed token/URL); the
//     empty token makes the REST backend omit the Authorization header for the server's token-free /sync.
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
//   • maybeAutoConnect()/acceptAutoSync()/declineAutoSync() (#21 auto-on): probe the served origin for a
//     token-free single-origin server and, if eligible+unseen, RAISE a one-time consent flag
//     (showAutoPrompt) — consent first, never a silent connect (rule 65 §6). accept → connectSingleOrigin()
//     + persist 'accepted'; decline → persist 'declined' (never re-asked). HEADLESS — nothing calls
//     maybeAutoConnect yet (the load-path wiring + the consent UI are the design-gated WI-3).
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
import { detectAutoSyncEligibility } from './singleOriginAuto'
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
  /**
   * Token-free single-origin connect (#19 WI-2): connect to the served origin
   * (`window.location.origin`) with an empty token — no typed token/URL. Same flow as `connect()`
   * (clear the stale queue, re-seed the current local data, start the orchestrator); the empty token
   * makes the REST backend omit the Authorization header for the server's token-free `/sync`.
   */
  connectSingleOrigin: () => void
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
  /**
   * Auto-on probe (#21): build a token-free single-origin probe backend (the served origin, empty token),
   * run the eligibility check, then — AFTER the async probe resolves — re-check `config === null &&
   * autoSyncPrompt === 'unseen'` (a manual connect or a decision during the probe must not be clobbered,
   * Gate-2 M4). If still eligible + unseen, RAISE the one-time consent flag (`showAutoPrompt`); it does
   * NOT connect (consent first — rule 65 §6). No-op when ineligible. Headless: nothing calls it yet (WI-3).
   */
  maybeAutoConnect: () => Promise<void>
  /** Consent → "Sync to my server": connect token-free single-origin + record `accepted` + dismiss the prompt. */
  acceptAutoSync: () => void
  /** Consent → "Keep local-only": record `declined` (never re-asked) + dismiss the prompt. Does NOT connect. */
  declineAutoSync: () => void
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

  // Token-free single-origin connect (#19 WI-2); also the accept path for the #21 auto-on consent.
  function connectSingleOrigin(): void {
    useSyncStore.getState().connectSingleOrigin() // origin config + empty token, resets cursor/seeded/revs
    useSyncQueueStore.getState().reset() // drop stale ops from a prior server/session before re-seeding
    // connectSingleOrigin always set a non-null config; read it back so the backend targets the exact
    // origin + empty token the store chose (token-free → the REST backend omits the Authorization header).
    launch(useSyncStore.getState().config as SyncConfig)
  }

  return {
    connect(config) {
      useSyncStore.getState().connect(config) // sets config, resets cursor/seeded/revs → a fresh seed
      useSyncQueueStore.getState().reset() // drop stale ops from a prior server/session before re-seeding
      launch(config)
    },
    connectSingleOrigin,
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
    async maybeAutoConnect() {
      // Build a token-free single-origin probe backend via the injectable factory (L3) and check if the
      // served origin is a token-free single-origin sync server. The probe backend is LOCAL — it never
      // becomes the controller's active backend (only launch() assigns that).
      const probe = createBackend({ serverUrl: window.location.origin, token: '' })
      const eligible = await detectAutoSyncEligibility({ pull: probe.pull })
      // Re-check AFTER the await (Gate-2 M4): a manual connect (config !== null) or a decision
      // (autoSyncPrompt !== 'unseen') during the in-flight probe must not be clobbered. Read fresh.
      const s = useSyncStore.getState()
      if (eligible && s.config === null && s.autoSyncPrompt === 'unseen') {
        s.setShowAutoPrompt(true) // surface the one-time consent; do NOT connect yet (rule 65 §6)
      }
    },
    acceptAutoSync() {
      connectSingleOrigin() // "Sync to my server" — token-free single-origin connect + seed + start syncing
      useSyncStore.getState().setAutoSyncPrompt('accepted') // durable: remembered across reloads/disconnect
      useSyncStore.getState().setShowAutoPrompt(false) // dismiss the prompt
    },
    declineAutoSync() {
      useSyncStore.getState().setAutoSyncPrompt('declined') // "Keep local-only" — never re-asked
      useSyncStore.getState().setShowAutoPrompt(false) // dismiss the prompt; no connect
    },
  }
}

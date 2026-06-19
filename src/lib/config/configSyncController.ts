// Purpose: the headless config-sync controller (#15 WI-7) — the orchestration layer over `configSync`
// (WI-5) that drives cross-device E2E provider-config sync, and the `useConfigSyncStore` state seam the
// passphrase/unlock UI (WI-6) reads via selectors + drives.
// SECURITY-CRITICAL: the passphrase + derived key live ONLY in memory (a closure var + the non-extractable
// key configCrypto holds for the session); NEVER persisted, NEVER logged. The ONLY persisted thing is the
// non-secret `syncedRev` (configSync's `lucid.config-rev` record). The server gets ONLY ciphertext (every
// PUT goes through configSync.encryptAndSave). Conflict ordering is the server `rev` ALONE (the plan, M1).
//
// Status machine (read via selectors): checking → insecure | noConfig | locked | error;
//   noConfig --setPassphrase--> unlocked (first device: encrypt current config + PUT);
//   locked --unlock--> unlocked|locked (returning device: pull + decrypt; wrong pass stays locked);
//   * --workLocalOnly--> localOnly (the design's "Work local-only"); error --retry--> re-runs the probe.
// Once `unlocked`, a debounced sync-on-change watches the providerStore: 200 advances `syncedRev`; 409
// (another device advanced rev) re-pulls + adopts the server config (last-writer-wins) and resets it. The
// adopt-hydrate is guarded so the controller's own write never re-arms a save (no loop). A `dirty` flag
// blocks a server adopt from clobbering a local edit made during the load window.
//
// TWO ERROR CHANNELS (the WI-6 design splits the blocking unlock card from the non-blocking sync banner):
//   * `status:'error'` + `error` — the BLOCKING channel (the design's Section C unlock/setup card). Used
//     ONLY for INIT and UNLOCK/SET-PASSPHRASE failures, where the user is not yet in an unlocked session.
//     `retry()` re-runs the startup PROBE. `insecure` is the blocking variant for a lost secure context.
//   * `syncError` — the NON-BLOCKING channel (the design's Section E Settings·Sync banner). Used for a
//     background sync-on-change SAVE failure once `unlocked`: the workspace stays `unlocked` and usable.
//     `retrySync()` re-attempts the SAVE (re-encrypt + PUT at a fresh baseRev), never a re-probe; a later
//     edit also re-arms the save. A successful save clears `syncError`.
//
// SAVE SERIALIZATION (H1/H2): saves never overlap. An edit while a save is in flight does not start a
// concurrent save (which would read a stale baseRev); it sets `dirty` + records a follow-up that runs
// once the in-flight save settles — and re-reads `baseRev` only THEN. `dirty` is cleared on a successful
// save ONLY if no edit arrived during that save (tracked by an edit-sequence counter); otherwise it stays
// true and a coalesced follow-up save runs, so an edit made during the await is never masked/lost.
//
// The providerStore coupling is isolated in a default adapter (read/apply/subscribe) so the logic is
// unit-testable with an injected fake; configSync, the secure-context probe, and the debounce window are
// likewise injectable (rule 65 §8 — mock the boundary, never the logic under test).

import { create } from 'zustand'
import type { Vendor } from '@/providers/types'
import { useProviderStore } from '@/stores/providerStore'
import {
  createConfigSync,
  type ConfigSync,
  type ConfigSyncErrorKind,
} from './configSync'
import type { SyncableConfig } from './providerConfigCodec'

/** The status the WI-6 UI renders. `error` carries the localized error KIND in `ConfigSyncStoreState.error`. */
export type ConfigSyncStatus =
  | 'checking' // probing the server on startup
  | 'insecure' // no secure context (no crypto.subtle) — HTTPS required
  | 'noConfig' // server has no blob yet — first device sets a passphrase
  | 'locked' // a blob exists — awaiting the passphrase to unlock
  | 'unlocked' // decrypted + syncing on change
  | 'localOnly' // user opted out of sync (the design's "Work local-only")
  | 'error' // a reachable-but-failed pull/save (see `error`)

/** The localized error key the UI maps (the design's `error.*`). `insecureContext` surfaces as `insecure`
 *  status, so it is not in this union — the union is the reachable-but-failed + decrypt failures. */
export type ConfigSyncErrorCode =
  | 'insecureContext'
  | 'wrongPassphraseOrCorrupt'
  | 'configUnreachable'
  | 'configRequestFailed'

/** Maps a configSync error KIND to the design's localized error code. */
function toErrorCode(kind: ConfigSyncErrorKind): ConfigSyncErrorCode {
  switch (kind) {
    case 'insecureContext':
      return 'insecureContext'
    case 'wrongPassphraseOrCorrupt':
      return 'wrongPassphraseOrCorrupt'
    case 'unreachable':
      return 'configUnreachable'
    case 'requestFailed':
      return 'configRequestFailed'
  }
}

/** The reactive state the UI reads via selectors (never destructured — AGENTS.md). */
export interface ConfigSyncStoreState {
  status: ConfigSyncStatus
  /** BLOCKING error (the unlock/setup card — Section C). Set only on INIT / UNLOCK / SET-PASSPHRASE failure. */
  error: ConfigSyncErrorCode | null
  /** NON-BLOCKING error (the Settings·Sync banner — Section E). Set on a background sync-on-change SAVE
   *  failure; the workspace stays `unlocked`. Cleared on the next successful save. */
  syncError: ConfigSyncErrorCode | null
  dirty: boolean
  /** Mirror of the last server rev this device incorporated (UI-readable; configSync persists the truth). */
  syncedRev: number
  set: (
    patch: Partial<Pick<ConfigSyncStoreState, 'status' | 'error' | 'syncError' | 'dirty' | 'syncedRev'>>,
  ) => void
  reset: () => void
}

const initialStoreState = (): Pick<
  ConfigSyncStoreState,
  'status' | 'error' | 'syncError' | 'dirty' | 'syncedRev'
> => ({
  status: 'checking',
  error: null,
  syncError: null,
  dirty: false,
  syncedRev: 0,
})

export const useConfigSyncStore = create<ConfigSyncStoreState>((set) => ({
  ...initialStoreState(),
  set: (patch) => set(patch),
  reset: () => set(initialStoreState()),
}))

/** The seam onto the providerStore: read the syncable config, hydrate a decrypted one, subscribe to edits. */
export interface ProviderConfigAdapter {
  /** Read the CURRENT syncable config (vendor/models/baseUrl/apiKeys) to encrypt + PUT. */
  read: () => SyncableConfig
  /** Hydrate a decrypted server config into the providerStore (adopt-on-load / 409 last-writer-wins). */
  apply: (config: SyncableConfig) => void
  /** Subscribe to config changes; returns an unsubscribe. Used to drive sync-on-change. */
  subscribe: (onChange: () => void) => () => void
}

export interface ConfigSyncControllerDeps {
  /** The WI-5 service this controller wraps. Injected in tests; default = same-origin `createConfigSync()`. */
  sync?: ConfigSync
  /** The providerStore seam. Injected in tests; default = the real `useProviderStore`-backed adapter. */
  providerConfig?: ProviderConfigAdapter
  /** Secure-context probe. Default = `!!globalThis.crypto?.subtle` (same signal as configCrypto/uuid.ts). */
  hasSecureContext?: () => boolean
  /** Debounce window for sync-on-change (ms); default 800 (mirrors the data-sync orchestrator). */
  debounceMs?: number
}

export interface ConfigSyncController {
  /** Startup: detect secure context, then probe the server for a stored blob. */
  init: () => Promise<void>
  /** First device: encrypt the CURRENT config under `passphrase`, PUT, then start sync-on-change. */
  setPassphrase: (passphrase: string) => Promise<void>
  /** Returning device: pull + decrypt; adopt the server config IFF newer and not locally dirty. */
  unlock: (passphrase: string) => Promise<void>
  /** Re-attempt the startup probe after a BLOCKING (init) failure. Re-runs init() → re-probes the server. */
  retry: () => Promise<void>
  /** Re-attempt a failed background SAVE after a NON-BLOCKING `syncError` (the Settings·Sync banner's
   *  retry). Re-encrypts + PUTs the current config at a fresh baseRev — never a re-probe. No-op unless
   *  `unlocked`. Clears `syncError` on success. */
  retrySync: () => Promise<void>
  /** Opt out of sync (the design's "Work local-only"); stops sync-on-change. */
  workLocalOnly: () => void
  /** Tear down the change subscription + any pending debounce (no secrets persist regardless). */
  dispose: () => void
}

/** The default providerStore-backed adapter. Hydrate uses the public setters so the mirrors stay in sync;
 *  an unknown vendor is left as the store's current (mergeProvider's guard) — keys ride only via setApiKey.
 *  The N custom providers (#10) are read with their keys (they ride the ciphertext) and hydrated via
 *  setState so a returning device gets the same DeepSeek-style custom + its key. Exported for unit tests
 *  (the production hydration path against the real store). */
export function defaultProviderConfigAdapter(): ProviderConfigAdapter {
  const VENDORS: readonly Vendor[] = ['anthropic', 'openai', 'gemini', 'ollama', 'custom']
  const isVendor = (v: string): v is Vendor => (VENDORS as readonly string[]).includes(v)
  return {
    read: () => {
      const s = useProviderStore.getState()
      const models: Record<string, string> = {}
      const apiKeys: Record<string, string> = {}
      for (const v of VENDORS) {
        models[v] = s.models[v]
        apiKeys[v] = s.apiKeys[v]
      }
      return {
        vendor: s.vendor,
        models,
        apiKeys,
        baseUrl: s.baseUrl,
        customProviders: s.customProviders,
        activeCustomId: s.activeCustomId,
      }
    },
    apply: (config) => {
      const store = useProviderStore.getState()
      for (const [v, m] of Object.entries(config.models)) {
        if (isVendor(v)) store.setModel(m, v)
      }
      for (const [v, k] of Object.entries(config.apiKeys)) {
        if (isVendor(v)) store.setApiKey(k, v)
      }
      store.setBaseUrl(config.baseUrl)
      // Hydrate the custom-provider map directly (the codec already sanitized them). The map carries each
      // custom's key — keys arrive only via this decrypted path, never localStorage (§5).
      useProviderStore.setState({ customProviders: config.customProviders, activeCustomId: config.activeCustomId })
      // Select the active target. An active custom uses the {type,id} form so setVendor keeps activeCustomId
      // (the string-'custom' path would reset it to null). A dangling id falls back to leaving the vendor.
      if (config.vendor === 'custom' && config.activeCustomId !== null) {
        store.setVendor({ type: 'custom', id: config.activeCustomId })
      } else if (isVendor(config.vendor)) {
        store.setVendor(config.vendor)
      }
    },
    subscribe: (onChange) => useProviderStore.subscribe(onChange),
  }
}

export function createConfigSyncController(deps: ConfigSyncControllerDeps = {}): ConfigSyncController {
  const sync = deps.sync ?? createConfigSync()
  const providerConfig = deps.providerConfig ?? defaultProviderConfigAdapter()
  const hasSecureContext = deps.hasSecureContext ?? (() => !!globalThis.crypto?.subtle)
  const debounceMs = deps.debounceMs ?? 800

  const store = () => useConfigSyncStore.getState()

  // SECRET — in memory only, never persisted, never logged (rule 65 §5). Held in this closure for the
  // session so sync-on-change can re-encrypt without re-prompting; cleared on dispose.
  let passphrase: string | null = null

  let unsubscribe: (() => void) | undefined
  let editTimer: ReturnType<typeof setTimeout> | undefined
  let applying = false // re-entrancy guard: the adopt-hydrate must not re-arm a save (invariant 6).
  // NOTE: `applying`/`saveInFlight` re-entrancy is correct only because subscribers dispatch SYNCHRONOUSLY
  // (zustand's `subscribe` calls listeners inline on set) — an async dispatch would let our own write slip
  // past the guard. The fake adapter in the test mirrors this synchronous dispatch.

  // SAVE SERIALIZATION (H1/H2): one save at a time. `saveInFlight` is the in-flight save loop; while it is
  // set, a fresh edit only flips `dirty` (the loop picks it up) — it never starts a concurrent save on a
  // stale baseRev. The loop re-runs while `dirty` is still set after a save, re-reading baseRev each pass.
  // `editSeq` increments on every user edit; a save captures it at start so it can tell whether an edit
  // arrived DURING the await (H2 — clear dirty only if `editSeq` is unchanged; otherwise the late edit,
  // absent from the just-sent PUT body, keeps dirty true and the loop saves it next pass).
  let saveInFlight: Promise<void> | null = null
  let editSeq = 0
  // Set when a background save fails; breaks the save loop so it does not spin while the server is down.
  // Cleared when a save next succeeds, when a fresh edit arrives, or by `retrySync` (the explicit retry).
  let saveFailed = false

  /** Record a server rev as incorporated: persist via configSync + mirror into the UI store. */
  function recordSyncedRev(rev: number): void {
    sync.writeSyncedRev(rev)
    store().set({ syncedRev: rev })
  }

  /** Adopt a decrypted server config into the providerStore without re-arming sync-on-change. */
  function adopt(config: SyncableConfig, rev: number): void {
    applying = true
    try {
      providerConfig.apply(config)
    } finally {
      applying = false
    }
    recordSyncedRev(rev)
    store().set({ dirty: false })
  }

  /** Map an INIT / UNLOCK / SET-PASSPHRASE failure to the BLOCKING channel (Section C). Insecure →
   *  `insecure`; a reachable-but-failed unlock stays on the locked surface; everything else → `error`. */
  function fail(kind: ConfigSyncErrorKind, lockedFallback = false): void {
    const code = toErrorCode(kind)
    if (kind === 'insecureContext') {
      store().set({ status: 'insecure', error: 'insecureContext' })
      return
    }
    store().set({ status: lockedFallback ? 'locked' : 'error', error: code })
  }

  /** Map a background sync-on-change SAVE failure to the NON-BLOCKING channel (Section E). The workspace
   *  stays `unlocked`; only `syncError` is set so the Settings·Sync banner can offer a save retry. A lost
   *  secure context is the one exception — encryption can never recover, so it is the blocking `insecure`. */
  function failSave(kind: ConfigSyncErrorKind): void {
    if (kind === 'insecureContext') {
      store().set({ status: 'insecure', error: 'insecureContext' })
      return
    }
    store().set({ syncError: toErrorCode(kind) })
  }

  /** Watch the providerStore for edits (idempotent; attaches once). A user edit ALWAYS marks `dirty` — even
   *  while `locked`/`checking` — so an edit during the unlock pull window blocks the server adopt (invariant
   *  5). The debounced SAVE only fires once `unlocked` (and never re-arms on our own adopt-hydrate). */
  function watchEdits(): void {
    if (unsubscribe) return
    unsubscribe = providerConfig.subscribe(() => {
      if (applying) return // our own adopt-hydrate, not a user edit
      editSeq++ // record THIS edit so an in-flight save can tell an edit arrived during its await (H2)
      saveFailed = false // a fresh edit re-arms the loop after a prior sync failure (M3: edit-driven retry)
      store().set({ dirty: true })
      const pass = passphrase
      if (store().status !== 'unlocked' || pass === null) return // track dirty, but don't push yet
      if (editTimer) clearTimeout(editTimer)
      editTimer = setTimeout(() => {
        editTimer = undefined
        requestSave() // funnels into the in-flight save loop; never starts a concurrent one (H1)
      }, debounceMs)
    })
  }

  /** The serialized entrypoint for a background save. If a save loop is already running, do nothing — it
   *  re-reads `dirty` after each pass and will push this edit on its next iteration (H1: no concurrent save
   *  on a stale baseRev). Otherwise start the loop. No-op without a passphrase / outside `unlocked`. */
  function requestSave(): void {
    if (passphrase === null || store().status !== 'unlocked') return
    if (saveInFlight) return
    saveInFlight = runSaveLoop()
  }

  /** Run saves back-to-back while `dirty` is still set after each pass, so saves never overlap and every
   *  pass reads a FRESH baseRev. Stops when a save leaves the config clean (H2: no edit arrived during the
   *  save), a 409 adopt resets to server state, or a save fails (the failure is surfaced; the next edit /
   *  `retrySync` re-arms the loop). Clears `saveInFlight` only when the loop ends. */
  async function runSaveLoop(): Promise<void> {
    try {
      // Keep saving while there is unpushed local work AND the failed-save flag is clear (a failure breaks
      // out so the loop does not spin retrying a downed server).
      while (store().dirty && !saveFailed && passphrase !== null && store().status === 'unlocked') {
        await save(passphrase)
      }
    } finally {
      saveInFlight = null
    }
  }

  /** Encrypt + PUT the current config at a FRESH `baseRev = readSyncedRev()`; handle applied / 409-adopt /
   *  failure. Always reads baseRev + the live config at call time (never a stale snapshot). On a successful
   *  save, `dirty` is cleared ONLY if no edit arrived during the await (H2 — `editSeq` unchanged); a late
   *  edit keeps `dirty` true so the loop pushes it next pass. The `establishing` flag routes failures to
   *  the BLOCKING channel (init/set-passphrase) vs the NON-BLOCKING `syncError` banner (sync-on-change). */
  async function save(pass: string, establishing = false): Promise<void> {
    const baseRev = sync.readSyncedRev()
    const seqAtStart = editSeq
    const res = await sync.encryptAndSave(pass, providerConfig.read(), baseRev)
    if (!res.ok) {
      if (establishing) fail(res.error)
      else {
        saveFailed = true // break the loop; the next edit / retrySync clears this and re-arms
        failSave(res.error)
      }
      return
    }
    saveFailed = false // a success clears any prior failure latch
    if (res.value.status === 'applied') {
      recordSyncedRev(res.value.rev)
      // H2: clear dirty ONLY if no edit landed DURING this save — otherwise the edit is absent from this
      // PUT body, so keep dirty true and the loop saves it next pass.
      const clean = editSeq === seqAtStart
      store().set({ status: 'unlocked', error: null, syncError: null, ...(clean ? { dirty: false } : {}) })
      return
    }
    // 409 conflict: the server advanced. Adopt its authoritative config (last-writer-wins) + reset rev.
    // `adopt` clears dirty, so the loop terminates — and the guarded adopt does not re-arm a save.
    adopt(res.value.config, res.value.rev)
    store().set({ status: 'unlocked', error: null, syncError: null })
  }

  async function init(): Promise<void> {
    // A re-probe starts a clean slate: clear BOTH error channels (a stale non-blocking syncError from a
    // prior unlocked session has no meaning while re-checking).
    store().set({ status: 'checking', error: null, syncError: null })
    if (!hasSecureContext()) {
      store().set({ status: 'insecure', error: 'insecureContext' })
      return
    }
    // Track edits from now on so an edit DURING the unlock pull window marks `dirty` and blocks the
    // server adopt (invariant 5). The debounced save still only pushes once unlocked.
    watchEdits()
    // Probe with an empty passphrase: a stored blob → `locked` (decrypt fails harmlessly, we only need
    // presence); no blob → `noConfig`. We do NOT adopt here — adoption needs the real passphrase (unlock).
    const res = await sync.loadAndDecrypt('')
    if (!res.ok) {
      // A decrypt failure on the probe means a blob EXISTS (it just can't be read with the empty probe) →
      // locked. A genuine transport failure → error.
      if (res.error === 'wrongPassphraseOrCorrupt') {
        store().set({ status: 'locked', error: null })
        return
      }
      fail(res.error)
      return
    }
    if (res.value === null) {
      store().set({ status: 'noConfig', error: null })
      return
    }
    // The empty-probe decrypted (an empty-passphrase blob exists) — still treat as locked: the user owns
    // the passphrase, and we never adopt without an explicit unlock.
    store().set({ status: 'locked', error: null })
  }

  async function setPassphrase(pass: string): Promise<void> {
    passphrase = pass
    // The establishing save uses the BLOCKING channel: until the first PUT applies the user is not yet in
    // an unlocked session, so a failure belongs on the setup card (status:'error'/'insecure'), not the
    // non-blocking banner. Run it through the serialized loop so a sync-on-change edit can't race it.
    await (saveInFlight = runEstablishingSave(pass))
    // `save` set `unlocked` on success (or `error`/`insecure` on failure). watchEdits is already attached
    // by init(); it begins pushing now that status is `unlocked`.
    if (store().status === 'unlocked') {
      watchEdits()
      // An edit during the establishing save's await left `dirty` true (H2) — kick the loop so that late
      // edit is pushed without waiting for the next user edit's debounce.
      if (store().dirty) requestSave()
    }
  }

  /** The first-device establishing save, serialized through `saveInFlight` like the background loop. */
  async function runEstablishingSave(pass: string): Promise<void> {
    try {
      await save(pass, true)
    } finally {
      saveInFlight = null
    }
  }

  async function unlock(pass: string): Promise<void> {
    const res = await sync.loadAndDecrypt(pass)
    if (!res.ok) {
      // Wrong passphrase / corrupt → stay locked; a transport failure → also stay on the locked surface.
      fail(res.error, true)
      return
    }
    passphrase = pass
    // Capture dirty AFTER the await: a local edit during the pull window must not be clobbered (invariant 5).
    const dirty = store().dirty
    if (res.value !== null && res.value.rev > sync.readSyncedRev() && !dirty) {
      adopt(res.value.config, res.value.rev)
    }
    store().set({ status: 'unlocked', error: null })
    watchEdits()
    // An edit made during the pull window blocked the adopt and left `dirty` true — now that we are
    // unlocked, push that local edit instead of leaving it stranded until the next edit's debounce.
    if (store().dirty) requestSave()
  }

  async function retry(): Promise<void> {
    await init()
  }

  /** The Settings·Sync banner's retry: re-attempt the failed background SAVE (re-encrypt + PUT at a fresh
   *  baseRev), NOT a re-probe. Routed through the same serialized loop, so it coalesces with / waits on any
   *  in-flight save. A no-op unless `unlocked` with a passphrase. `syncError` is cleared by `save` on a
   *  successful push. */
  async function retrySync(): Promise<void> {
    if (passphrase === null || store().status !== 'unlocked') return
    saveFailed = false // explicit retry: clear the failure latch so the loop runs again
    if (saveInFlight) {
      await saveInFlight
      return
    }
    // A retry re-attempts even a "clean" dirty flag: a save failure leaves `dirty` true, so the loop has
    // work; if somehow not dirty, the loop is a cheap no-op.
    await (saveInFlight = runSaveLoop())
  }

  function workLocalOnly(): void {
    dispose()
    store().set({ status: 'localOnly', error: null })
  }

  function dispose(): void {
    if (editTimer) {
      clearTimeout(editTimer)
      editTimer = undefined
    }
    unsubscribe?.()
    unsubscribe = undefined
    passphrase = null // drop the secret from memory — the save loop's `passphrase !== null` guard then stops
  }

  return { init, setPassphrase, unlock, retry, retrySync, workLocalOnly, dispose }
}

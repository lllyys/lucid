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
  error: ConfigSyncErrorCode | null
  dirty: boolean
  /** Mirror of the last server rev this device incorporated (UI-readable; configSync persists the truth). */
  syncedRev: number
  set: (patch: Partial<Pick<ConfigSyncStoreState, 'status' | 'error' | 'dirty' | 'syncedRev'>>) => void
  reset: () => void
}

const initialStoreState = (): Pick<ConfigSyncStoreState, 'status' | 'error' | 'dirty' | 'syncedRev'> => ({
  status: 'checking',
  error: null,
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
  /** Re-attempt the startup probe after a reachable failure. */
  retry: () => Promise<void>
  /** Opt out of sync (the design's "Work local-only"); stops sync-on-change. */
  workLocalOnly: () => void
  /** Tear down the change subscription + any pending debounce (no secrets persist regardless). */
  dispose: () => void
}

/** The default providerStore-backed adapter. Hydrate uses the public setters so the mirrors stay in sync;
 *  an unknown vendor is left as the store's current (mergeProvider's guard) — keys ride only via setApiKey.
 *  Exported for unit tests (the production hydration path against the real store). */
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
      return { vendor: s.vendor, models, apiKeys, baseUrl: s.baseUrl }
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
      if (isVendor(config.vendor)) store.setVendor(config.vendor)
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
  let applying = false // re-entrancy guard: the adopt-hydrate must not re-arm a save (invariant 6)

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

  /** Map a configSync failure to a status + error. Insecure → `insecure`; everything else → `error`. */
  function fail(kind: ConfigSyncErrorKind, lockedFallback = false): void {
    const code = toErrorCode(kind)
    if (kind === 'insecureContext') {
      store().set({ status: 'insecure', error: 'insecureContext' })
      return
    }
    // A reachable-but-failed unlock keeps the user on the locked surface; an init/save failure → error.
    store().set({ status: lockedFallback ? 'locked' : 'error', error: code })
  }

  /** Watch the providerStore for edits (idempotent; attaches once). A user edit ALWAYS marks `dirty` — even
   *  while `locked`/`checking` — so an edit during the unlock pull window blocks the server adopt (invariant
   *  5). The debounced SAVE only fires once `unlocked` (and never re-arms on our own adopt-hydrate). */
  function watchEdits(): void {
    if (unsubscribe) return
    unsubscribe = providerConfig.subscribe(() => {
      if (applying) return // our own adopt-hydrate, not a user edit
      store().set({ dirty: true })
      const pass = passphrase
      if (store().status !== 'unlocked' || pass === null) return // track dirty, but don't push yet
      if (editTimer) clearTimeout(editTimer)
      editTimer = setTimeout(() => {
        editTimer = undefined
        void save(pass)
      }, debounceMs)
    })
  }

  /** Encrypt + PUT the current config at `baseRev = syncedRev`; handle applied / 409-adopt / failure. */
  async function save(pass: string): Promise<void> {
    const baseRev = sync.readSyncedRev()
    const res = await sync.encryptAndSave(pass, providerConfig.read(), baseRev)
    if (!res.ok) {
      fail(res.error)
      return
    }
    if (res.value.status === 'applied') {
      recordSyncedRev(res.value.rev)
      store().set({ dirty: false, status: 'unlocked', error: null })
      return
    }
    // 409 conflict: the server advanced. Adopt its authoritative config (last-writer-wins) + reset rev.
    // This terminates — the adopt is guarded, so it does not re-arm another save.
    adopt(res.value.config, res.value.rev)
    store().set({ status: 'unlocked', error: null })
  }

  async function init(): Promise<void> {
    store().set({ status: 'checking', error: null })
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
    await save(pass)
    // `save` set `unlocked` on success (or `error`/`insecure` on failure). watchEdits is already attached
    // by init(); it begins pushing now that status is `unlocked`.
    if (store().status === 'unlocked') watchEdits()
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
  }

  async function retry(): Promise<void> {
    await init()
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
    passphrase = null // drop the secret from memory
  }

  return { init, setPassphrase, unlock, retry, workLocalOnly, dispose }
}

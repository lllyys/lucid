// Purpose: the provider CONFIGURATION store (rule 65 §1) — the active vendor, its model + API key,
// and a readiness check. Configuration only: it does NOT own a running operation (that's
// operationStore). Keys are PER-VENDOR (#5 WI-3): `apiKeys`/`models` hold every vendor's value, and
// `apiKey`/`model` are denormalized MIRRORS of the active vendor so every existing reader
// (`useProviderStore((s) => s.apiKey)`, `keyChange`, `usePanelRun`) keeps working unchanged.
// setVendor RESTORES that vendor's last model + key (not reset-to-default), so switching back keeps
// your selection. All keys are in memory only; never persisted, never logged (rule 65 §5).
// The NON-SECRET config (active vendor, per-vendor models, custom base URL) IS persisted across reloads
// (#12) via `persist` + `partializeProvider`, which excludes `apiKey`/`apiKeys`/`testResults` — so the
// §5 keys-in-memory guarantee holds: keys are structurally never written to disk.
// Components must read via selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Vendor } from '@/providers/types'
import { isVendorImplemented, resolveModel } from '@/providers/modelRegistry'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'
import { isRecord } from '@/lib/guards'

const VENDORS: readonly Vendor[] = ['anthropic', 'openai', 'gemini', 'ollama', 'custom']

/** Per-vendor "test connection" outcome (#6). Latency on success; an i18n msgKey on failure. */
export interface TestResult {
  status: 'idle' | 'testing' | 'ok' | 'fail'
  latencyMs?: number
  msgKey?: string
}

interface ProviderState {
  vendor: Vendor
  /** Mirror of `models[vendor]` — the active vendor's selected model. */
  model: string
  /** Mirror of `apiKeys[vendor]` — the active vendor's key (in memory only). */
  apiKey: string
  /** Per-vendor API keys, in memory only (rule 65 §5). */
  apiKeys: Record<Vendor, string>
  /** Per-vendor selected model, so switching vendors restores the prior choice. */
  models: Record<Vendor, string>
  /** Endpoint base URL for the custom / OpenAI-compatible provider (#7); unused by named vendors. */
  baseUrl: string
  /** Per-vendor test-connection outcomes (#6), in memory only. */
  testResults: Record<Vendor, TestResult>
  setVendor: (vendor: Vendor) => void
  /** Set a model. Targets `vendor` if given (Settings edits the viewed provider), else the active one. */
  setModel: (model: string, vendor?: Vendor) => void
  /** Set a key. Targets `vendor` if given, else the active one. The active-vendor mirror stays in sync. */
  setApiKey: (apiKey: string, vendor?: Vendor) => void
  setBaseUrl: (baseUrl: string) => void
  /** Clear a key. Targets `vendor` if given, else the active one. */
  clearKey: (vendor?: Vendor) => void
  /** Record a per-vendor test-connection outcome (#6). */
  setTestResult: (vendor: Vendor, result: TestResult) => void
  isReady: () => boolean
  reset: () => void
}

const emptyKeys = (): Record<Vendor, string> =>
  Object.fromEntries(VENDORS.map((v) => [v, ''])) as Record<Vendor, string>
const defaultModels = (): Record<Vendor, string> =>
  Object.fromEntries(VENDORS.map((v) => [v, resolveModel(v)])) as Record<Vendor, string>
const idleTests = (): Record<Vendor, TestResult> =>
  Object.fromEntries(VENDORS.map((v) => [v, { status: 'idle' }])) as Record<Vendor, TestResult>

const initial = (): Pick<
  ProviderState,
  'vendor' | 'model' | 'apiKey' | 'apiKeys' | 'models' | 'baseUrl' | 'testResults'
> => ({
  vendor: 'anthropic',
  model: resolveModel('anthropic'),
  apiKey: '',
  apiKeys: emptyKeys(),
  models: defaultModels(),
  baseUrl: '',
  testResults: idleTests(),
})

// --- Persistence (#12): persist the NON-SECRET config; keys/testResults stay in-memory (rule 65 §5).
export const PERSIST_VERSION = 1

/** The allowlist of persisted fields. NEVER `apiKey`/`apiKeys`/`model`/`testResults`. */
export function partializeProvider(s: ProviderState): Pick<ProviderState, 'vendor' | 'models' | 'baseUrl'> {
  return { vendor: s.vendor, models: s.models, baseUrl: s.baseUrl }
}

/** No prior persisted provider data has ever existed; passthrough current version, drop any other. */
export function migrateProvider(persisted: unknown, version: number): unknown {
  return version === PERSIST_VERSION ? persisted : undefined
}

/**
 * Runs on EVERY hydration (unlike `migrate`), so it sanitizes the blob. Spreads `current` to preserve
 * the store ACTIONS + the in-memory fields (`apiKey`/`apiKeys`/`testResults` — keys never come back from
 * disk). Guards a corrupt/unknown vendor (membership check FIRST — `isVendorImplemented` throws on a
 * non-registry key), overlays a partial `models` onto the complete defaults, and re-derives the
 * `model` mirror. Precedent: `mergeSyncQueue` (`syncQueueStore.ts`).
 */
export function mergeProvider(persisted: unknown, current: ProviderState): ProviderState {
  if (!isRecord(persisted)) return current
  const pv = persisted.vendor
  const vendor: Vendor =
    typeof pv === 'string' && (VENDORS as readonly string[]).includes(pv) ? (pv as Vendor) : current.vendor
  const models: Record<Vendor, string> = { ...current.models }
  if (isRecord(persisted.models)) {
    for (const v of VENDORS) {
      const m = persisted.models[v]
      if (typeof m === 'string' && m !== '') models[v] = m
    }
  }
  const baseUrl = typeof persisted.baseUrl === 'string' ? persisted.baseUrl : current.baseUrl
  return { ...current, vendor, models, baseUrl, model: models[vendor] }
}

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      ...initial(),
      setVendor: (vendor) => {
        if (!isVendorImplemented(vendor)) return // refuse; state unchanged
        const s = get()
        // Restore that vendor's last model + key (not reset-to-default), keeping the mirrors in sync.
        set({ vendor, model: s.models[vendor], apiKey: s.apiKeys[vendor] })
      },
      // Each setter targets `vendor` (the Settings-viewed provider) when given, else the active one. The
      // active-vendor mirror (`model`/`apiKey`) is updated ONLY when the target IS the active vendor.
      setModel: (model, vendor) =>
        set((s) => {
          const target = vendor ?? s.vendor
          return { models: { ...s.models, [target]: model }, ...(target === s.vendor ? { model } : {}) }
        }),
      setApiKey: (apiKey, vendor) =>
        set((s) => {
          const target = vendor ?? s.vendor
          return { apiKeys: { ...s.apiKeys, [target]: apiKey }, ...(target === s.vendor ? { apiKey } : {}) }
        }),
      setBaseUrl: (baseUrl) => set({ baseUrl }), // custom provider (#7); persisted (#12), never a secret
      setTestResult: (vendor, result) => set((s) => ({ testResults: { ...s.testResults, [vendor]: result } })),
      clearKey: (vendor) =>
        set((s) => {
          const target = vendor ?? s.vendor
          return { apiKeys: { ...s.apiKeys, [target]: '' }, ...(target === s.vendor ? { apiKey: '' } : {}) }
        }),
      // Ready needs an implemented vendor; remote vendors need a key, the custom provider also needs a
      // base URL + model, and local Ollama needs neither — only a model (it runs on-device, no key #5).
      isReady: () => {
        const s = get()
        if (!isVendorImplemented(s.vendor)) return false
        if (s.vendor === 'ollama') return s.model.trim() !== '' // local: no key needed
        // custom: a base URL + model are required; the API key is OPTIONAL (keyless self-hosted OR a
        // keyed proxy like OpenRouter — #5/#7/#29 user decision). The named remote vendors need a key.
        if (s.vendor === 'custom') return s.baseUrl.trim() !== '' && s.model.trim() !== ''
        if (s.apiKeys[s.vendor].trim() === '') return false
        return true
      },
      reset: () => set({ ...initial() }),
    }),
    {
      name: 'lucid.provider',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })),
      partialize: partializeProvider,
      migrate: migrateProvider,
      merge: mergeProvider,
    },
  ),
)

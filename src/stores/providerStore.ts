// Purpose: the provider CONFIGURATION store (rule 65 §1) — the active vendor, its model + API key,
// and a readiness check. Configuration only: it does NOT own a running operation (that's
// operationStore). Keys are PER-VENDOR (#5 WI-3): `apiKeys`/`models` hold every vendor's value, and
// `apiKey`/`model` are denormalized MIRRORS of the active vendor so every existing reader
// (`useProviderStore((s) => s.apiKey)`, `keyChange`, `usePanelRun`) keeps working unchanged.
// setVendor RESTORES that vendor's last model + key (not reset-to-default), so switching back keeps
// your selection. All keys are in memory only; never persisted, never logged (rule 65 §5).
// N user-defined OpenAI-compatible providers (#10) live in `customProviders` (keyed by an opaque
// crypto id), with `activeCustomId` naming the one in use; `vendor` stays 'custom' as the dynamic
// marker. Each custom holds its own key + testResult IN MEMORY ONLY (never persisted).
// The NON-SECRET config (active vendor, per-vendor models, custom base URL, the custom providers'
// {id,label,baseUrl,model}, activeCustomId) IS persisted across reloads (#12/#10) via `persist` +
// `partializeProvider`, which excludes `apiKey`/`apiKeys`/`testResults` AND strips each custom's
// key/testResult — so the §5 keys-in-memory guarantee holds: keys are structurally never written to
// disk. The v1→v2 migration + the open-keyed defensive rehydrate live in providerStoreMigrate.ts.
// Components must read via selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ProviderConfig, Vendor } from '@/providers/types'
import { isVendorImplemented, resolveModel } from '@/providers/modelRegistry'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'
import { isRecord } from '@/lib/guards'
import {
  type CustomProvider,
  makeCustomProvider,
  migrateProviderV1toV2,
  pickActiveCustomId,
  sanitizeCustomProviders,
  uniqueLabel as uniqueLabelOf,
} from './providerStoreMigrate'

export type { CustomProvider } from './providerStoreMigrate'

const VENDORS: readonly Vendor[] = ['anthropic', 'openai', 'gemini', 'ollama', 'custom']

/** What's active: a built-in vendor, or a specific custom provider by id (#10). */
export type VendorTarget = Vendor | { type: 'custom'; id: string }

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
  /** N user-defined OpenAI-compatible providers (#10), keyed by opaque id. Keys/testResults in memory. */
  customProviders: Record<string, CustomProvider>
  /** The custom provider in use when `vendor==='custom'`; null when a built-in is active (#10). */
  activeCustomId: string | null
  setVendor: (target: VendorTarget) => void
  /** Set a model. Targets `vendor`/`customId` if given (Settings edits the viewed provider), else active. */
  setModel: (model: string, vendor?: Vendor, customId?: string) => void
  /** Set a key. Targets `vendor`/`customId` if given, else the active one. The active mirror stays in sync. */
  setApiKey: (apiKey: string, vendor?: Vendor, customId?: string) => void
  /** Set the custom base URL. Targets a custom provider by id when given (#10), else the legacy slot. */
  setBaseUrl: (baseUrl: string, customId?: string) => void
  /** Clear a key. Targets `vendor`/`customId` if given, else the active one. */
  clearKey: (vendor?: Vendor, customId?: string) => void
  /** Record a per-vendor test-connection outcome (#6); a `customId` targets a custom provider (#10). */
  setTestResult: (vendor: Vendor, result: TestResult, customId?: string) => void
  /** Add a custom provider (#10); mints + returns its opaque id. */
  addCustomProvider: (fields: { label: string; baseUrl: string; model: string; key?: string }) => string
  /** Patch a custom provider's editable fields (#10); unknown id is a no-op. */
  updateCustomProvider: (id: string, patch: Partial<Pick<CustomProvider, 'label' | 'baseUrl' | 'model' | 'key'>>) => void
  /** Remove a custom provider (#10); removing the active one falls back to the anthropic built-in. */
  removeCustomProvider: (id: string) => void
  /** Trim + case-insensitive label uniqueness across the custom providers (#10). */
  uniqueLabel: (label: string, exceptId?: string) => boolean
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
  'vendor' | 'model' | 'apiKey' | 'apiKeys' | 'models' | 'baseUrl' | 'testResults' | 'customProviders' | 'activeCustomId'
> => ({
  vendor: 'anthropic',
  model: resolveModel('anthropic'),
  apiKey: '',
  apiKeys: emptyKeys(),
  models: defaultModels(),
  baseUrl: '',
  testResults: idleTests(),
  customProviders: {},
  activeCustomId: null,
})

// --- Persistence (#12/#10): persist the NON-SECRET config; keys/testResults stay in-memory (rule 65 §5).
export const PERSIST_VERSION = 2

/** The persisted shape of one custom provider — NEVER its key or its transient testResult (§5). */
type PersistedCustom = Pick<CustomProvider, 'id' | 'label' | 'baseUrl' | 'model'>

/** The allowlist of persisted fields. NEVER `apiKey`/`apiKeys`/`model`/`testResults`; customs stripped. */
export function partializeProvider(
  s: ProviderState,
): Pick<ProviderState, 'vendor' | 'models' | 'baseUrl' | 'activeCustomId'> & {
  customProviders: Record<string, PersistedCustom>
} {
  const customProviders: Record<string, PersistedCustom> = {}
  for (const [id, c] of Object.entries(s.customProviders)) {
    customProviders[id] = { id: c.id, label: c.label, baseUrl: c.baseUrl, model: c.model } // strip key + testResult
  }
  return { vendor: s.vendor, models: s.models, baseUrl: s.baseUrl, customProviders, activeCustomId: s.activeCustomId }
}

/** persist `migrate`: v1 single-custom → v2 N-custom (providerStoreMigrate); drops unknown versions. */
export function migrateProvider(persisted: unknown, version: number): unknown {
  return migrateProviderV1toV2(persisted, version)
}

/**
 * Runs on EVERY hydration (unlike `migrate`), so it sanitizes the blob. Spreads `current` to preserve
 * the store ACTIONS + the in-memory fields (`apiKey`/`apiKeys`/`testResults` — keys never come back from
 * disk). Guards a corrupt/unknown vendor (membership check FIRST — `isVendorImplemented` throws on a
 * non-registry key), overlays a partial `models` onto the complete defaults, re-derives the `model`
 * mirror, and rehydrates the open-keyed custom-provider map defensively (own-key iterate, drop hostile/
 * malformed entries, force key/testResult to in-memory defaults, cap the count, null a dangling
 * activeCustomId). Precedent: `mergeSyncQueue` (`syncQueueStore.ts`).
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
  const customProviders = sanitizeCustomProviders(persisted.customProviders)
  const activeCustomId = pickActiveCustomId(persisted.activeCustomId, customProviders)
  return { ...current, vendor, models, baseUrl, model: models[vendor], customProviders, activeCustomId }
}

/**
 * The single source of truth for the EFFECTIVE provider config of the active target (#10 WI-2). For a
 * built-in vendor it is the denormalized mirror `{apiKey, model, baseUrl}`; for an active custom it is
 * THAT custom's own `{key, model, baseUrl}` (read from `customProviders[activeCustomId]`), NOT the
 * legacy top-level slot. A dangling/absent active custom falls back to the mirror (never crashes —
 * `isReady` already gates the run). Call sites (`usePanelRun`, `useTestConnection`) build the
 * `ProviderConfig` passed to the PURE `createProvider` from this, so RUN + readiness read one model.
 */
export function activeTarget(s: ProviderState): ProviderConfig {
  if (s.vendor === 'custom') {
    const c = s.activeCustomId ? s.customProviders[s.activeCustomId] : undefined
    if (c !== undefined) return { apiKey: c.key, model: c.model, baseUrl: c.baseUrl }
  }
  return { apiKey: s.apiKey, model: s.model, baseUrl: s.baseUrl }
}

/**
 * Immutably patch ONE custom provider's editable fields and/or its testResult, returning the partial
 * `{customProviders}` state slice. An unknown id yields no change. Shared by every custom-targeted
 * setter (#10) so the spread + guard live in one place.
 */
function patchCustom(
  s: ProviderState,
  id: string,
  patch?: Partial<Pick<CustomProvider, 'label' | 'baseUrl' | 'model' | 'key'>>,
  testResult?: TestResult,
): Partial<ProviderState> {
  const existing = s.customProviders[id]
  if (existing === undefined) return {}
  const next: CustomProvider = { ...existing, ...patch }
  if (testResult !== undefined) next.testResult = testResult
  return { customProviders: { ...s.customProviders, [id]: next } }
}

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      ...initial(),
      setVendor: (target) => {
        if (typeof target === 'object') {
          // A specific custom provider (#10): refuse an unknown id; mark vendor='custom' + activeCustomId.
          if (!(target.id in get().customProviders)) return
          set({ vendor: 'custom', activeCustomId: target.id })
          return
        }
        if (!isVendorImplemented(target)) return // refuse; state unchanged
        const s = get()
        // Restore that vendor's last model + key (not reset-to-default), keeping the mirrors in sync.
        // Switching to a built-in clears the active custom (#10).
        set({ vendor: target, model: s.models[target], apiKey: s.apiKeys[target], activeCustomId: null })
      },
      // Each setter targets a custom provider by id (#10), or `vendor` (the Settings-viewed provider),
      // else the active one. The active-vendor mirror (`model`/`apiKey`) is updated ONLY when the target
      // IS the active vendor. A custom-targeted edit updates that custom's own record.
      setModel: (model, vendor, customId) =>
        set((s) => {
          if (customId !== undefined) return patchCustom(s, customId, { model })
          const target = vendor ?? s.vendor
          return { models: { ...s.models, [target]: model }, ...(target === s.vendor ? { model } : {}) }
        }),
      setApiKey: (apiKey, vendor, customId) =>
        set((s) => {
          if (customId !== undefined) return patchCustom(s, customId, { key: apiKey })
          const target = vendor ?? s.vendor
          return { apiKeys: { ...s.apiKeys, [target]: apiKey }, ...(target === s.vendor ? { apiKey } : {}) }
        }),
      setBaseUrl: (baseUrl, customId) =>
        set((s) => (customId !== undefined ? patchCustom(s, customId, { baseUrl }) : { baseUrl })),
      setTestResult: (vendor, result, customId) =>
        set((s) =>
          customId !== undefined
            ? patchCustom(s, customId, undefined, result)
            : { testResults: { ...s.testResults, [vendor]: result } },
        ),
      clearKey: (vendor, customId) =>
        set((s) => {
          if (customId !== undefined) return patchCustom(s, customId, { key: '' })
          const target = vendor ?? s.vendor
          return { apiKeys: { ...s.apiKeys, [target]: '' }, ...(target === s.vendor ? { apiKey: '' } : {}) }
        }),
      addCustomProvider: (fields) => {
        const entry = makeCustomProvider(fields)
        set((s) => ({ customProviders: { ...s.customProviders, [entry.id]: entry } }))
        return entry.id
      },
      updateCustomProvider: (id, patch) =>
        set((s) => (id in s.customProviders ? patchCustom(s, id, patch) : {})),
      removeCustomProvider: (id) =>
        set((s) => {
          if (!(id in s.customProviders)) return {}
          const customProviders = { ...s.customProviders }
          delete customProviders[id]
          // Clearing the removed custom's id is unconditional: a dangling activeCustomId must never
          // survive a remove, even if a built-in is already the active vendor (Gate-4 Medium). When
          // that custom was also the ACTIVE provider (vendor==='custom'), additionally fall back
          // deterministically to the anthropic built-in (#10).
          if (s.activeCustomId === id) {
            if (s.vendor === 'custom') {
              return {
                customProviders,
                activeCustomId: null,
                vendor: 'anthropic',
                model: s.models.anthropic,
                apiKey: s.apiKeys.anthropic,
              }
            }
            return { customProviders, activeCustomId: null }
          }
          return { customProviders }
        }),
      uniqueLabel: (label, exceptId) => uniqueLabelOf(label, get().customProviders, exceptId),
      // Ready needs an implemented vendor; remote vendors need a key, the custom provider also needs a
      // base URL + model, and local Ollama needs neither — only a model (it runs on-device, no key #5).
      isReady: () => {
        const s = get()
        if (!isVendorImplemented(s.vendor)) return false
        if (s.vendor === 'ollama') return s.model.trim() !== '' // local: no key needed
        // custom: the ACTIVE custom provider's base URL + model are required; its key is OPTIONAL
        // (keyless self-hosted OR a keyed proxy like OpenRouter — #5/#7/#29). A null/dangling
        // activeCustomId → not ready (never crashes — #10). The named remote vendors need a key.
        if (s.vendor === 'custom') {
          const c = s.activeCustomId ? s.customProviders[s.activeCustomId] : undefined
          return c !== undefined && c.baseUrl.trim() !== '' && c.model.trim() !== ''
        }
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

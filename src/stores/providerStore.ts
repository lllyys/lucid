// Purpose: the provider CONFIGURATION store (rule 65 §1) — the active vendor, its model + API key,
// and a readiness check. Configuration only: it does NOT own a running operation (that's
// operationStore). Keys are PER-VENDOR (#5 WI-3): `apiKeys`/`models` hold every vendor's value, and
// `apiKey`/`model` are denormalized MIRRORS of the active vendor so every existing reader
// (`useProviderStore((s) => s.apiKey)`, `keyChange`, `usePanelRun`) keeps working unchanged.
// setVendor RESTORES that vendor's last model + key (not reset-to-default), so switching back keeps
// your selection. All keys are in memory only; never persisted, never logged (rule 65 §5).
// Components must read via selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import type { Vendor } from '@/providers/types'
import { isVendorImplemented, resolveModel } from '@/providers/modelRegistry'

const VENDORS: readonly Vendor[] = ['anthropic', 'openai', 'gemini', 'ollama', 'custom']

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
  setVendor: (vendor: Vendor) => void
  setModel: (model: string) => void
  setApiKey: (apiKey: string) => void
  setBaseUrl: (baseUrl: string) => void
  clearKey: () => void
  isReady: () => boolean
  reset: () => void
}

const emptyKeys = (): Record<Vendor, string> =>
  Object.fromEntries(VENDORS.map((v) => [v, ''])) as Record<Vendor, string>
const defaultModels = (): Record<Vendor, string> =>
  Object.fromEntries(VENDORS.map((v) => [v, resolveModel(v)])) as Record<Vendor, string>

const initial = (): Pick<ProviderState, 'vendor' | 'model' | 'apiKey' | 'apiKeys' | 'models' | 'baseUrl'> => ({
  vendor: 'anthropic',
  model: resolveModel('anthropic'),
  apiKey: '',
  apiKeys: emptyKeys(),
  models: defaultModels(),
  baseUrl: '',
})

export const useProviderStore = create<ProviderState>((set, get) => ({
  ...initial(),
  setVendor: (vendor) => {
    if (!isVendorImplemented(vendor)) return // refuse; state unchanged
    const s = get()
    // Restore that vendor's last model + key (not reset-to-default), keeping the mirrors in sync.
    set({ vendor, model: s.models[vendor], apiKey: s.apiKeys[vendor] })
  },
  setModel: (model) => set((s) => ({ model, models: { ...s.models, [s.vendor]: model } })),
  setApiKey: (apiKey) => set((s) => ({ apiKey, apiKeys: { ...s.apiKeys, [s.vendor]: apiKey } })),
  setBaseUrl: (baseUrl) => set({ baseUrl }), // for the custom provider (#7); in-memory like apiKey
  clearKey: () => set((s) => ({ apiKey: '', apiKeys: { ...s.apiKeys, [s.vendor]: '' } })), // active vendor only
  // Ready needs an implemented vendor; remote vendors need a key, the custom provider also needs a
  // base URL + model, and local Ollama needs neither — only a model (it runs on-device, no key #5).
  isReady: () => {
    const s = get()
    if (!isVendorImplemented(s.vendor)) return false
    if (s.vendor === 'ollama') return s.model.trim() !== ''
    if (s.apiKeys[s.vendor].trim() === '') return false
    if (s.vendor === 'custom') return s.baseUrl.trim() !== '' && s.model.trim() !== ''
    return true
  },
  reset: () => set({ ...initial() }),
}))

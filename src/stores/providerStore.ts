// Purpose: the provider CONFIGURATION store (rule 65 §1) — the active vendor,
// model, API key, and a readiness check. Configuration only: it does NOT own a
// running translate/polish operation or live OperationState (that lands with the
// behavioral feature #3). setVendor refuses an unimplemented vendor and atomically
// resets the model to that vendor's default. The API key is held in memory only;
// secure at-rest storage is a future feature (rule 65 §5). Components must read via
// selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import type { Vendor } from '@/providers/types'
import { isVendorImplemented, resolveModel } from '@/providers/modelRegistry'

interface ProviderState {
  vendor: Vendor
  model: string
  apiKey: string
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

const INITIAL: Pick<ProviderState, 'vendor' | 'model' | 'apiKey' | 'baseUrl'> = {
  vendor: 'anthropic',
  model: resolveModel('anthropic'),
  apiKey: '',
  baseUrl: '',
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  ...INITIAL,
  setVendor: (vendor) => {
    if (!isVendorImplemented(vendor)) return // refuse; state unchanged
    set({ vendor, model: resolveModel(vendor) }) // atomic: vendor + its default model
  },
  setModel: (model) => set({ model }),
  setApiKey: (apiKey) => set({ apiKey }),
  setBaseUrl: (baseUrl) => set({ baseUrl }), // for the custom provider (#7); in-memory like apiKey
  clearKey: () => set({ apiKey: '' }), // additive (feature #4, WI-1); vendor/model untouched
  // Ready needs an implemented vendor + a key; the custom provider also needs a base URL + a model.
  isReady: () =>
    isVendorImplemented(get().vendor) &&
    get().apiKey.trim() !== '' &&
    (get().vendor !== 'custom' || (get().baseUrl.trim() !== '' && get().model.trim() !== '')),
  reset: () => set({ ...INITIAL }),
}))

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
  setVendor: (vendor: Vendor) => void
  setModel: (model: string) => void
  setApiKey: (apiKey: string) => void
  isReady: () => boolean
  reset: () => void
}

const INITIAL: Pick<ProviderState, 'vendor' | 'model' | 'apiKey'> = {
  vendor: 'anthropic',
  model: resolveModel('anthropic'),
  apiKey: '',
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  ...INITIAL,
  setVendor: (vendor) => {
    if (!isVendorImplemented(vendor)) return // refuse; state unchanged
    set({ vendor, model: resolveModel(vendor) }) // atomic: vendor + its default model
  },
  setModel: (model) => set({ model }),
  setApiKey: (apiKey) => set({ apiKey }),
  isReady: () => isVendorImplemented(get().vendor) && get().apiKey.trim() !== '',
  reset: () => set({ ...INITIAL }),
}))

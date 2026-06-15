// Purpose: a crash-proof zustand `StateStorage` backed by localStorage (feature #3, WI-3). Browser
// storage fails in many ways — quota exceeded, disabled cookies, corrupt/oversized blobs, SSR/no
// window — and NONE of them may crash the app on boot. Reads discard absent/corrupt/oversized data
// (→ null, so `persist` rehydrates to defaults); writes swallow quota/security errors (best-effort,
// with an optional `onWriteError` so the store can surface a one-time notice). The API key is never
// routed through here — it lives only in the in-memory providerStore (rule 65 §5).

import type { StateStorage } from 'zustand/middleware'

export interface SafeStorageOptions {
  /** Test seam / SSR guard: returns the backing Storage, or null when unavailable. */
  backend?: () => Storage | null
  /** Reject a stored blob larger than this (defaults to 1MB) — guards a corrupt/runaway entry. */
  maxBytes?: number
  /** Called when a write fails (e.g. QuotaExceededError) — the store can surface a localized notice. */
  onWriteError?: (error: unknown) => void
}

const DEFAULT_MAX_BYTES = 1_000_000

function defaultBackend(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null // accessing localStorage can throw (e.g. blocked third-party cookies)
  }
}

export function createSafeJSONStorage(opts: SafeStorageOptions = {}): StateStorage {
  const backend = opts.backend ?? defaultBackend
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES

  return {
    getItem: (name) => {
      const store = backend()
      if (!store) return null
      let raw: string | null
      try {
        raw = store.getItem(name)
      } catch {
        return null
      }
      if (raw == null || raw.length > maxBytes) return null
      try {
        JSON.parse(raw) // validate — a corrupt blob is discarded, not handed to the rehydrator
        return raw
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      const store = backend()
      if (!store) return
      try {
        store.setItem(name, value)
      } catch (error) {
        opts.onWriteError?.(error) // best-effort: quota/security failures never crash a write
      }
    },
    removeItem: (name) => {
      const store = backend()
      if (!store) return
      try {
        store.removeItem(name)
      } catch {
        /* swallow */
      }
    },
  }
}

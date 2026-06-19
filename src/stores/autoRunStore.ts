// Purpose: the auto-run preference store (feature #11, WI-2). Holds the per-panel auto-run toggle
// and the one-time per-vendor hosted-provider cost acknowledgment. Off by default so a hosted
// provider never fires surprise paid calls per keystroke (rule 65). Persisted across reloads under
// its OWN key `lucid.autorun` — fully SEPARATE from the secret-bearing `lucid.provider` store (rule
// 65 §5: no key/secret is ever routed through here, only two boolean maps). The debounce TIMER lives
// in useAutoRunDebounce (no runtime state here); this store is preferences only. Corrupt/partial
// persisted blobs degrade to defaults via mergeAutoRun (never crash on boot). Components read via
// selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Vendor } from '@/providers/types'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'
import { isRecord } from '@/lib/guards'

/** Auto-run applies only to the two source-editing panels (NOT the draftTranslate mirror). */
export type AutoRunPanelId = 'translate' | 'polish'

const PANELS: readonly AutoRunPanelId[] = ['translate', 'polish']
const VENDORS: readonly Vendor[] = ['anthropic', 'openai', 'gemini', 'ollama', 'custom']

export const AUTORUN_PERSIST_KEY = 'lucid.autorun'
export const AUTORUN_PERSIST_VERSION = 1

interface AutoRunState {
  /** Per-panel auto-run toggle. Off by default; persists per workspace (survives reload). */
  enabled: Record<AutoRunPanelId, boolean>
  /** Per-vendor one-time hosted cost acknowledgment (the cost gate shows once per hosted vendor). */
  costAck: Record<Vendor, boolean>
  setEnabled: (panel: AutoRunPanelId, on: boolean) => void
  ackCost: (vendor: Vendor) => void
  reset: () => void
}

const allOff = (): Record<AutoRunPanelId, boolean> =>
  Object.fromEntries(PANELS.map((p) => [p, false])) as Record<AutoRunPanelId, boolean>
const noAck = (): Record<Vendor, boolean> =>
  Object.fromEntries(VENDORS.map((v) => [v, false])) as Record<Vendor, boolean>

const initial = (): Pick<AutoRunState, 'enabled' | 'costAck'> => ({
  enabled: allOff(),
  costAck: noAck(),
})

/** Persist ONLY the two preference maps — no secrets, no runtime/timer state (rule 65 §5). */
export function partializeAutoRun(s: AutoRunState): Pick<AutoRunState, 'enabled' | 'costAck'> {
  return { enabled: s.enabled, costAck: s.costAck }
}

/** No prior persisted auto-run data has ever existed; passthrough current version, drop any other. */
export function migrateAutoRun(persisted: unknown, version: number): unknown {
  return version === AUTORUN_PERSIST_VERSION ? persisted : undefined
}

/**
 * Runs on EVERY hydration: spreads `current` (preserving the actions) and overlays only the KNOWN
 * boolean values from the persisted blob onto the complete defaults. A corrupt/non-object blob, a
 * non-boolean value, or an unknown panel/vendor key is ignored — defaults win, never a crash.
 */
export function mergeAutoRun(persisted: unknown, current: AutoRunState): AutoRunState {
  if (!isRecord(persisted)) return current
  const enabled: Record<AutoRunPanelId, boolean> = { ...current.enabled }
  if (isRecord(persisted.enabled)) {
    for (const p of PANELS) {
      if (typeof persisted.enabled[p] === 'boolean') enabled[p] = persisted.enabled[p]
    }
  }
  const costAck: Record<Vendor, boolean> = { ...current.costAck }
  if (isRecord(persisted.costAck)) {
    for (const v of VENDORS) {
      if (typeof persisted.costAck[v] === 'boolean') costAck[v] = persisted.costAck[v]
    }
  }
  return { ...current, enabled, costAck }
}

export const useAutoRunStore = create<AutoRunState>()(
  persist(
    (set) => ({
      ...initial(),
      setEnabled: (panel, on) => set((s) => ({ enabled: { ...s.enabled, [panel]: on } })),
      ackCost: (vendor) => set((s) => ({ costAck: { ...s.costAck, [vendor]: true } })),
      reset: () => set({ ...initial() }),
    }),
    {
      name: AUTORUN_PERSIST_KEY,
      version: AUTORUN_PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })),
      partialize: partializeAutoRun,
      migrate: migrateAutoRun,
      merge: mergeAutoRun,
    },
  ),
)

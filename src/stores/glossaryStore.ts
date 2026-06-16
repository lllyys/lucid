// Purpose: the persisted domain Glossary for the sidebar (feature #3, WI-2). Reusable domain terms
// (case-insensitively de-duped) that the user can inject into the Polish keywords ("use") and that
// `extractTerms` proposes. Persisted via the crash-proof safeJSONStorage (corrupt/oversized → empty
// glossary, never a crash). Terms are not secrets and are local-only; the API key is never here
// (rule 65 §5). Components read via selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'
import { isRecord } from '@/lib/guards'

// Sync envelope (#9): every syncable entity carries `updatedAt` (client logical timestamp — display/
// merge metadata; the SERVER-assigned rev is the ordering authority) + `deletedAt` (tombstone; null =
// live). Terms are add/remove only (no edit action), so updatedAt always equals createdAt for a Term;
// the envelope is kept uniform across entity types because the sync layer treats them as one shape.
export interface Term {
  id: string
  label: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

const PERSIST_VERSION = 2

// Injectable clock + id counter (test seams, mirroring sessionStore).
let clock: () => number = Date.now
let idSeq = 0
const genId = (): string => `g${++idSeq}`
export function __setGlossaryClock(fn: () => number): void {
  clock = fn
}
export function __resetGlossaryIds(): void {
  idSeq = 0
}

interface GlossaryState {
  terms: Term[]
  addTerm: (label: string) => void
  removeTerm: (id: string) => void
  reset: () => void
}

const INITIAL: Pick<GlossaryState, 'terms'> = { terms: [] }

/**
 * persist migrate: v2 (current) passes through; v1 predates the sync envelope. v1 terms carry NO
 * timestamp, so createdAt/updatedAt are backfilled to 0 — a deterministic "legacy / unknown creation
 * time" sentinel that is also the LWW-safe choice (a real later edit on any device always wins).
 * deletedAt → null. Never throws AND never poisons the store: a non-object top level or non-array
 * `terms` → undefined → defaults; an entry missing a string `id`/`label` is skipped (one malformed
 * entry never discards the rest). `label` validation matters — `addTerm`'s dedup and `extractTerms`
 * call string methods on it, so a non-string label would crash normal use, not merely look odd.
 */
export function migrateGlossary(persisted: unknown, version: number): unknown {
  if (version === PERSIST_VERSION) return persisted
  if (version === 1) {
    if (!isRecord(persisted) || !Array.isArray(persisted.terms)) return undefined
    const terms: Term[] = []
    for (const raw of persisted.terms as unknown[]) {
      if (!isRecord(raw)) continue // null/garbage entry → skip, salvage the rest
      if (typeof raw.id !== 'string' || typeof raw.label !== 'string') continue // malformed term → skip
      terms.push({ id: raw.id, label: raw.label, createdAt: 0, updatedAt: 0, deletedAt: null })
    }
    return { terms }
  }
  return undefined
}
export function partializeGlossary(s: GlossaryState): Pick<GlossaryState, 'terms'> {
  return { terms: s.terms }
}

export const useGlossaryStore = create<GlossaryState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      addTerm: (label) => {
        const trimmed = label.trim()
        if (trimmed === '') return
        const exists = get().terms.some((t) => t.label.toLowerCase() === trimmed.toLowerCase())
        if (exists) return // case-insensitive de-dupe: first label wins
        const now = clock()
        set({ terms: [...get().terms, { id: genId(), label: trimmed, createdAt: now, updatedAt: now, deletedAt: null }] })
      },
      removeTerm: (id) => set({ terms: get().terms.filter((t) => t.id !== id) }),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'lucid.glossary',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })),
      migrate: migrateGlossary,
      partialize: partializeGlossary,
    },
  ),
)

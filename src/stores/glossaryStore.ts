// Purpose: the persisted domain Glossary for the sidebar (feature #3, WI-2). Reusable domain terms
// (case-insensitively de-duped) that the user can inject into the Polish keywords ("use") and that
// `extractTerms` proposes. Persisted via the crash-proof safeJSONStorage (corrupt/oversized → empty
// glossary, never a crash). Terms are not secrets and are local-only; the API key is never here
// (rule 65 §5). Components read via selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'

export interface Term {
  id: string
  label: string
}

const PERSIST_VERSION = 1

let idSeq = 0
const genId = (): string => `g${++idSeq}`
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

export function migrateGlossary(persisted: unknown, version: number): unknown {
  return version === PERSIST_VERSION ? persisted : undefined
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
        set({ terms: [...get().terms, { id: genId(), label: trimmed }] })
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

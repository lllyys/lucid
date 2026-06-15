// Purpose: the Polish panel's domain keywords, hoisted from PolishPanel's local state to a store
// (feature #3, WI-6) so the sidebar Glossary's "use" can inject a term without prop-drilling or
// coupling GlossaryView to PolishPanel. Persisted globally (feature #8) — one keyword set shared
// across sessions, via the same crash-proof safeJSONStorage the glossary uses (corrupt/oversized →
// empty set, never a crash). Keywords are not secrets and are local-only; the API key is never here
// (rule 65 §5). Components read via selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'

const PERSIST_VERSION = 1

interface PolishKeywordsState {
  keywords: string[]
  addKeyword: (keyword: string) => void
  removeKeyword: (keyword: string) => void
  reset: () => void
}

const INITIAL: Pick<PolishKeywordsState, 'keywords'> = { keywords: [] }

export function migrateKeywords(persisted: unknown, version: number): unknown {
  return version === PERSIST_VERSION ? persisted : undefined
}
export function partializeKeywords(s: PolishKeywordsState): Pick<PolishKeywordsState, 'keywords'> {
  return { keywords: s.keywords }
}

export const usePolishKeywordsStore = create<PolishKeywordsState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      addKeyword: (keyword) => {
        const trimmed = keyword.trim()
        if (trimmed === '' || get().keywords.includes(trimmed)) return
        set({ keywords: [...get().keywords, trimmed] })
      },
      removeKeyword: (keyword) => set({ keywords: get().keywords.filter((k) => k !== keyword) }),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'lucid.keywords',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })),
      migrate: migrateKeywords,
      partialize: partializeKeywords,
    },
  ),
)

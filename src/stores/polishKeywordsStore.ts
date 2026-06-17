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
import { isRecord } from '@/lib/guards'
import { keywordId } from '@/lib/keywordId'

// Sync envelope (#9): a keyword is now an entity (id/value/updatedAt/deletedAt) rather than a bare
// string, so the sync layer can track it. `id` is DERIVED from the value (see keywordId) so the same
// keyword added on two devices converges to ONE entity. No createdAt — keywords are add/remove only
// and the sync envelope per the plan is {id, updatedAt, deletedAt}.
export interface Keyword {
  id: string
  value: string
  updatedAt: number
  deletedAt: number | null
}

const PERSIST_VERSION = 2

// Injectable clock (test seam, mirroring the sibling stores).
let clock: () => number = Date.now
export function __setKeywordsClock(fn: () => number): void {
  clock = fn
}

// keywordId (the value-derived id) lives in the pure @/lib/keywordId module (imported above) so the
// sync layer can validate keyword ids without importing this store's side-effecting module.

interface PolishKeywordsState {
  keywords: Keyword[]
  addKeyword: (keyword: string) => void
  removeKeyword: (keyword: string) => void
  reset: () => void
}

const INITIAL: Pick<PolishKeywordsState, 'keywords'> = { keywords: [] }

/**
 * persist migrate: v2 (current) passes through; v1 stored keywords as a plain `string[]`. Convert
 * each to a Keyword (id from value, updatedAt 0 — the legacy/unknown-time sentinel, LWW-safe — and a
 * null tombstone), trimming, dropping empties, and de-duping so no two entries share a derived id.
 * Never throws: a non-object top level or non-array `keywords` → undefined → defaults; a non-string
 * entry is skipped.
 */
export function migrateKeywords(persisted: unknown, version: number): unknown {
  if (version === PERSIST_VERSION) return persisted
  if (version === 1) {
    if (!isRecord(persisted) || !Array.isArray(persisted.keywords)) return undefined
    const keywords: Keyword[] = []
    for (const raw of persisted.keywords as unknown[]) {
      if (typeof raw !== 'string') continue // v1 entries are strings; skip garbage
      const value = raw.trim()
      if (value === '' || keywords.some((k) => k.value === value)) continue // drop empties + dupes
      keywords.push({ id: keywordId(value), value, updatedAt: 0, deletedAt: null })
    }
    return { keywords }
  }
  return undefined
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
        if (trimmed === '' || get().keywords.some((k) => k.value === trimmed)) return
        const now = clock()
        set({ keywords: [...get().keywords, { id: keywordId(trimmed), value: trimmed, updatedAt: now, deletedAt: null }] })
      },
      removeKeyword: (keyword) => set({ keywords: get().keywords.filter((k) => k.value !== keyword) }),
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

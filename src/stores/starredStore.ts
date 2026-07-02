// Purpose: the persisted "starred translations" review list (feature #22, WI-1). A personal collection
// of word- and sentence-translations the user stars to revisit (vocabulary / study) — DISTINCT from the
// Glossary (#3): the Glossary injects reusable domain terms into prompts for consistency; starred items
// are a review list and are NEVER prompt-injected. Mirrors glossaryStore's sync envelope + crash-proof
// safeJSONStorage (corrupt/oversized → empty list, never a crash) + test seams. Items are local-only and
// not secrets; the API key is never here (rule 65 §5). Components read via selectors (AGENTS.md).

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'
import { randomUuid } from '@/lib/uuid'

// Sync envelope (#9): every syncable entity carries `updatedAt` (client logical timestamp — display/
// merge metadata; the SERVER-assigned rev is the ordering authority) + `deletedAt` (tombstone; null =
// live). Starred items are star/unstar only (no edit), so updatedAt always equals createdAt; the
// envelope shape is kept uniform across entity types because the sync layer treats them as one shape.
export interface StarredItem {
  id: string
  kind: 'word' | 'sentence'
  source: string
  translation: string
  ipa?: string
  meaning?: string
  sourceLang: string
  targetLang: string
  context?: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** The content a caller stars — the id + timestamp envelope is minted by the store. */
export type StarredInput = Omit<StarredItem, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

const PERSIST_VERSION = 1

// Injectable clock (test seam, mirroring the sibling stores).
let clock: () => number = Date.now
export function __setStarredClock(fn: () => number): void {
  clock = fn
}

// Globally-unique ids (crypto.randomUUID), collision-free across reloads (bug #55) and devices
// (#9-sync prerequisite). Tests install a deterministic counter via the seams below; production
// never calls those, so production always mints uuids. (Mirrors glossaryStore.)
const randomGenId = (): string => `st_${randomUuid()}`
let genId: () => string = randomGenId
/** Test seam: deterministic counter ids (st1, st2, …) for stable assertions. */
export function __resetStarredIds(): void {
  let n = 0
  genId = () => `st${++n}`
}
/** Test seam: restore the production crypto.randomUUID generator. */
export function __useRandomStarredIds(): void {
  genId = randomGenId
}

interface StarredState {
  items: StarredItem[]
  star: (input: StarredInput) => void
  unstar: (id: string) => void
  reset: () => void
}

const INITIAL: Pick<StarredState, 'items'> = { items: [] }

/**
 * Content-scan dedupe key: two stars are the SAME content iff this tuple matches. Mirrors glossary's
 * "random uuid + local content-scan" precedent (NOT a value-derived id) — so a re-star of the same
 * word/sentence + direction is idempotent without a multi-KB value-derived id.
 *
 * `context` is deliberately NOT part of the key (bug #9): it's populated only for word lookups, and
 * keying on it made the SAME word looked up in different sentences duplicate across the starred list
 * (a vocabulary list should hold one entry per word + direction). The first star wins; a later star of
 * the same word in another context is a no-op.
 */
function sameContent(a: StarredInput, b: StarredItem): boolean {
  return (
    a.kind === b.kind &&
    a.source === b.source &&
    a.sourceLang === b.sourceLang &&
    a.targetLang === b.targetLang
  )
}

/** Pure search selector — case-insensitive substring over source + translation + meaning. */
export function searchStarred(items: StarredItem[], query: string): StarredItem[] {
  const q = query.trim().toLowerCase()
  if (q === '') return items
  return items.filter(
    (i) =>
      i.source.toLowerCase().includes(q) ||
      i.translation.toLowerCase().includes(q) ||
      (i.meaning?.toLowerCase().includes(q) ?? false),
  )
}

/**
 * persist migrate: v1 (current) passes through. There is no prior version of this store, so any other
 * version is discarded (→ undefined → defaults). Never throws AND never poisons the store — a corrupt
 * or oversized blob is already neutralized by safeJSONStorage; an unknown version is simply dropped.
 */
export function migrateStarred(persisted: unknown, version: number): unknown {
  if (version === PERSIST_VERSION) return persisted
  return undefined
}
export function partializeStarred(s: StarredState): Pick<StarredState, 'items'> {
  return { items: s.items }
}

export const useStarredStore = create<StarredState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      star: (input) => {
        if (get().items.some((i) => sameContent(input, i))) return // content-scan dedupe → no-op
        const now = clock()
        set({ items: [...get().items, { ...input, id: genId(), createdAt: now, updatedAt: now, deletedAt: null }] })
      },
      // HARD-remove from the array (Gate-2 M4): the deletion tombstone is synthesized by diff.ts on the
      // next sync cycle, NOT stored in-place — matching glossaryStore.removeTerm + reconcile's inbound
      // hard-remove (no soft-tombstone accumulation, no resurrect ambiguity). Live items always have
      // deletedAt:null.
      unstar: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'lucid.starred',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })),
      migrate: migrateStarred,
      partialize: partializeStarred,
    },
  ),
)

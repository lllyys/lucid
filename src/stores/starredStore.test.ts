// WI-1 — starredStore: content-scan dedupe + HARD-delete unstar + safeJSONStorage + migrate + seams.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useStarredStore,
  searchStarred,
  migrateStarred,
  partializeStarred,
  __resetStarredIds,
  __useRandomStarredIds,
  __setStarredClock,
  type StarredInput,
  type StarredItem,
} from './starredStore'

const base: StarredInput = {
  kind: 'word',
  source: 'cat',
  translation: 'gato',
  sourceLang: 'en',
  targetLang: 'es',
}

let t = 1000
beforeEach(() => {
  __resetStarredIds()
  t = 1000
  __setStarredClock(() => ++t)
  useStarredStore.getState().reset()
})

const star = (input: StarredInput) => useStarredStore.getState().star(input)
const items = () => useStarredStore.getState().items

describe('starred id uniqueness (mirrors glossary bug #55)', () => {
  it('mints collision-free ids across reloads — production uses crypto.randomUUID, not a resettable counter', () => {
    __useRandomStarredIds()
    star(base)
    const first = items()[0].id
    __useRandomStarredIds() // a reload re-initializes the generator
    star({ ...base, source: 'dog' })
    const afterReload = items()[1].id
    expect(afterReload).not.toBe(first)
    expect(first).toMatch(/^st_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})

describe('starredStore.star', () => {
  it('starts empty', () => {
    expect(items()).toEqual([])
  })

  it('adds a live item with a minted id + sync envelope (createdAt=updatedAt, deletedAt:null)', () => {
    star(base)
    expect(items()).toHaveLength(1)
    const it0 = items()[0]
    expect(it0).toMatchObject({ kind: 'word', source: 'cat', translation: 'gato', sourceLang: 'en', targetLang: 'es' })
    expect(it0.id).toBeTruthy()
    expect(it0.createdAt).toBe(it0.updatedAt)
    expect(it0.deletedAt).toBeNull()
  })

  it('preserves optional ipa/meaning/context fields', () => {
    star({ ...base, ipa: 'kæt', meaning: 'a small feline', context: 'The cat sat.' })
    expect(items()[0]).toMatchObject({ ipa: 'kæt', meaning: 'a small feline', context: 'The cat sat.' })
  })

  it('content-scan dedupe: an exact-tuple duplicate is a no-op (one item, first wins)', () => {
    star(base)
    star({ ...base, translation: 'DIFFERENT' }) // same dedupe tuple → ignored even though translation differs
    expect(items()).toHaveLength(1)
    expect(items()[0].translation).toBe('gato') // first wins
  })

  it.each([
    { field: 'kind', over: { kind: 'sentence' as const } },
    { field: 'source', over: { source: 'dog' } },
    { field: 'context', over: { context: 'an animal' } },
    { field: 'sourceLang', over: { sourceLang: 'fr' } },
    { field: 'targetLang', over: { targetLang: 'de' } },
  ])('treats an item differing only in $field as distinct (not deduped)', ({ over }) => {
    star(base)
    star({ ...base, ...over })
    expect(items()).toHaveLength(2)
  })

  it('stars CJK, RTL, and mixed-script sources (no whitespace-word assumptions)', () => {
    star({ ...base, kind: 'sentence', source: '世界你好', translation: 'Hello world' })
    star({ ...base, kind: 'sentence', source: 'مرحبا بالعالم', sourceLang: 'ar' })
    star({ ...base, kind: 'sentence', source: 'hello 世界 mixed' })
    expect(items().map((i) => i.source)).toEqual(['世界你好', 'مرحبا بالعالم', 'hello 世界 mixed'])
  })
})

describe('starredStore.unstar (HARD-remove)', () => {
  it('removes by id, leaving others — absent from items (no soft tombstone)', () => {
    star(base)
    star({ ...base, source: 'dog' })
    const id = items()[0].id
    useStarredStore.getState().unstar(id)
    expect(items().map((i) => i.source)).toEqual(['dog'])
    expect(items().some((i) => i.id === id)).toBe(false)
  })

  it('is a no-op for an unknown id', () => {
    star(base)
    useStarredStore.getState().unstar('st_does-not-exist')
    expect(items()).toHaveLength(1)
  })
})

describe('searchStarred', () => {
  const seed = () => {
    star({ ...base, source: 'cat', translation: 'gato', meaning: 'a feline' })
    star({ ...base, source: 'dog', translation: 'perro', meaning: 'a canine' })
    star({ ...base, source: 'bird', translation: 'pajaro' }) // no meaning (undefined branch)
  }

  it('returns all items for an empty / whitespace-only query', () => {
    seed()
    expect(searchStarred(items(), '')).toHaveLength(3)
    expect(searchStarred(items(), '   ')).toHaveLength(3)
  })

  it('matches on source (case-insensitive)', () => {
    seed()
    expect(searchStarred(items(), 'CAT').map((i) => i.source)).toEqual(['cat'])
  })

  it('matches on translation when source does not', () => {
    seed()
    expect(searchStarred(items(), 'perro').map((i) => i.source)).toEqual(['dog'])
  })

  it('matches on meaning when source/translation do not', () => {
    seed()
    expect(searchStarred(items(), 'canine').map((i) => i.source)).toEqual(['dog'])
  })

  it('returns [] when nothing matches (incl. an item with no meaning — no crash)', () => {
    seed()
    expect(searchStarred(items(), 'zzz')).toEqual([])
  })
})

describe('persist helpers', () => {
  it('reset clears all items', () => {
    star(base)
    useStarredStore.getState().reset()
    expect(items()).toEqual([])
  })

  it('migrateStarred passes through the current version (v1) by reference', () => {
    const state = { items: [] as StarredItem[] }
    expect(migrateStarred(state, 1)).toBe(state)
  })

  it.each([
    { desc: 'older version 0', v: 0 },
    { desc: 'unknown future version', v: 9 },
  ])('migrateStarred discards $desc (→ undefined → defaults)', ({ v }) => {
    expect(migrateStarred({ items: [] }, v)).toBeUndefined()
  })

  it.each([
    { desc: 'a non-object top level', persisted: null },
    { desc: 'a number', persisted: 42 },
    { desc: 'a corrupt/oversized blob shape', persisted: { items: 'nope' } },
  ])('migrateStarred never throws on $desc', ({ persisted }) => {
    expect(() => migrateStarred(persisted, 0)).not.toThrow()
    expect(migrateStarred(persisted, 0)).toBeUndefined()
  })

  it('partializeStarred persists only items', () => {
    star(base)
    const persisted = partializeStarred(useStarredStore.getState())
    expect(Object.keys(persisted)).toEqual(['items'])
    expect(persisted.items).toBe(items())
  })
})

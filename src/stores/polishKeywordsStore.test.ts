import { describe, it, expect, beforeEach } from 'vitest'
import {
  usePolishKeywordsStore,
  migrateKeywords,
  partializeKeywords,
  keywordId,
  __setKeywordsClock,
  type Keyword,
} from './polishKeywordsStore'

let t = 1000
beforeEach(() => {
  t = 1000
  __setKeywordsClock(() => ++t)
  usePolishKeywordsStore.getState().reset()
})

const values = (): string[] => usePolishKeywordsStore.getState().keywords.map((k) => k.value)

describe('polishKeywordsStore', () => {
  it('starts empty', () => {
    expect(usePolishKeywordsStore.getState().keywords).toEqual([])
  })

  it('addKeyword trims and appends, de-duping exact repeats', () => {
    const { addKeyword } = usePolishKeywordsStore.getState()
    addKeyword('  inference  ')
    addKeyword('inference')
    addKeyword('neural net')
    expect(values()).toEqual(['inference', 'neural net'])
  })

  it('ignores an empty / whitespace-only keyword', () => {
    usePolishKeywordsStore.getState().addKeyword('   ')
    expect(usePolishKeywordsStore.getState().keywords).toEqual([])
  })

  it('removeKeyword removes the exact value', () => {
    const s = usePolishKeywordsStore.getState()
    s.addKeyword('alpha')
    s.addKeyword('beta')
    s.removeKeyword('alpha')
    expect(values()).toEqual(['beta'])
  })

  it('reset clears keywords', () => {
    usePolishKeywordsStore.getState().addKeyword('alpha')
    usePolishKeywordsStore.getState().reset()
    expect(usePolishKeywordsStore.getState().keywords).toEqual([])
  })

  it('addKeyword stamps the sync envelope + a deterministic id derived from the value', () => {
    usePolishKeywordsStore.getState().addKeyword('inference')
    const k = usePolishKeywordsStore.getState().keywords[0]
    expect(k).toMatchObject({ value: 'inference', deletedAt: null })
    expect(k.id).toBe(keywordId('inference')) // id derived from value → cross-device convergence
    expect(typeof k.updatedAt).toBe('number')
  })
})

describe('keywordId', () => {
  it('is deterministic — the same value always yields the same id (cross-device convergence)', () => {
    expect(keywordId('inference')).toBe(keywordId('inference'))
  })
  it('distinguishes different values', () => {
    expect(keywordId('inference')).not.toBe(keywordId('attention'))
  })
  it('is collision-free — distinct values never share an id (regression: these collided under a 32-bit hash)', () => {
    // 'dgackrhf' and 'xlellzqn' both hashed to the same djb2 id; an encoded id cannot collide, so a
    // sync layer keyed on id will never merge two distinct keywords into one entity.
    expect(keywordId('dgackrhf')).not.toBe(keywordId('xlellzqn'))
  })
  it('never throws on a lone surrogate and keeps distinct surrogates distinct (encodeURIComponent would throw)', () => {
    expect(() => keywordId('\uD800')).not.toThrow()
    expect(keywordId('\uD800')).not.toBe(keywordId('\uD801'))
  })
})

// #9 WI-1c — keywords convert from string[] to Keyword[] (sync envelope: id/value/updatedAt/deletedAt).
// The localStorage round-trip is verified at Gate 5 (no localStorage backend in this jsdom env);
// here we cover the persist helpers as pure functions to reach 100%, as the sibling stores do.
describe('persist helpers (#9 WI-1c)', () => {
  it('migrateKeywords discards an older/unknown version (→ undefined → defaults)', () => {
    expect(migrateKeywords({ keywords: [] }, 0)).toBeUndefined()
  })
  it('migrateKeywords passes through the current version (v2) by reference', () => {
    const state = { keywords: [] as Keyword[] }
    expect(migrateKeywords(state, 2)).toBe(state)
  })
  it('migrateKeywords backfills v1 string[] → v2 Keyword[] (id from value, updatedAt 0, deletedAt null)', () => {
    const migrated = migrateKeywords({ keywords: ['inference', 'neural net'] }, 1) as { keywords: Keyword[] }
    expect(migrated.keywords).toEqual([
      { id: keywordId('inference'), value: 'inference', updatedAt: 0, deletedAt: null },
      { id: keywordId('neural net'), value: 'neural net', updatedAt: 0, deletedAt: null },
    ])
  })
  it('migrateKeywords v1 → v2: trims, drops empties, and de-dupes (no two entries share a derived id)', () => {
    const migrated = migrateKeywords({ keywords: ['  inference  ', 'inference', '   ', 'neural net'] }, 1) as {
      keywords: Keyword[]
    }
    expect(migrated.keywords.map((k) => k.value)).toEqual(['inference', 'neural net'])
  })
  it('migrateKeywords v1 → v2: skips a non-string entry (never throws)', () => {
    const migrated = migrateKeywords({ keywords: [42, 'ok', null] }, 1) as { keywords: Keyword[] }
    expect(migrated.keywords.map((k) => k.value)).toEqual(['ok'])
  })
  it('migrateKeywords v1 → v2: a non-array keywords field or non-object top level → undefined', () => {
    expect(migrateKeywords({ keywords: 'nope' }, 1)).toBeUndefined()
    expect(migrateKeywords(null, 1)).toBeUndefined()
    expect(migrateKeywords(42, 1)).toBeUndefined()
  })
  it('migrateKeywords v1 → v2: a lone-surrogate keyword migrates without throwing (never-throws contract)', () => {
    const migrated = migrateKeywords({ keywords: ['\uD800', 'ok'] }, 1) as { keywords: Keyword[] }
    expect(migrated.keywords.map((k) => k.value)).toEqual(['\uD800', 'ok'])
  })
  it('partializeKeywords persists only keywords', () => {
    usePolishKeywordsStore.getState().addKeyword('inference')
    const persisted = partializeKeywords(usePolishKeywordsStore.getState())
    expect(Object.keys(persisted)).toEqual(['keywords'])
    expect(persisted.keywords).toBe(usePolishKeywordsStore.getState().keywords)
  })
})

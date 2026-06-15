import { describe, it, expect, beforeEach } from 'vitest'
import { usePolishKeywordsStore, migrateKeywords, partializeKeywords } from './polishKeywordsStore'

beforeEach(() => {
  usePolishKeywordsStore.getState().reset()
})

describe('polishKeywordsStore', () => {
  it('starts empty', () => {
    expect(usePolishKeywordsStore.getState().keywords).toEqual([])
  })

  it('addKeyword trims and appends, de-duping exact repeats', () => {
    const { addKeyword } = usePolishKeywordsStore.getState()
    addKeyword('  inference  ')
    addKeyword('inference')
    addKeyword('neural net')
    expect(usePolishKeywordsStore.getState().keywords).toEqual(['inference', 'neural net'])
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
    expect(usePolishKeywordsStore.getState().keywords).toEqual(['beta'])
  })

  it('reset clears keywords', () => {
    usePolishKeywordsStore.getState().addKeyword('alpha')
    usePolishKeywordsStore.getState().reset()
    expect(usePolishKeywordsStore.getState().keywords).toEqual([])
  })
})

// #8 — keywords now persist globally (lucid.keywords) via the same crash-proof
// safeJSONStorage the glossary uses. The localStorage round-trip is verified at
// Gate 5 (no localStorage backend in this jsdom env); here we cover the persist
// helpers as pure functions, exactly as glossaryStore.test.ts does to reach 100%.
describe('persist helpers (#8)', () => {
  it('migrateKeywords discards an older version', () => {
    expect(migrateKeywords({ keywords: [] }, 0)).toBeUndefined()
  })
  it('migrateKeywords passes through the current version', () => {
    const state = { keywords: ['inference'] }
    expect(migrateKeywords(state, 1)).toBe(state)
  })
  it('partializeKeywords persists only keywords', () => {
    expect(partializeKeywords({ keywords: ['inference', 'neural net'] } as never)).toEqual({
      keywords: ['inference', 'neural net'],
    })
  })
})

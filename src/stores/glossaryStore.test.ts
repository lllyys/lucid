import { describe, it, expect, beforeEach } from 'vitest'
import {
  useGlossaryStore,
  migrateGlossary,
  partializeGlossary,
  __resetGlossaryIds,
  type Term,
} from './glossaryStore'

beforeEach(() => {
  __resetGlossaryIds()
  useGlossaryStore.getState().reset()
})

describe('glossaryStore', () => {
  it('starts empty', () => {
    expect(useGlossaryStore.getState().terms).toEqual([])
  })

  it('addTerm trims and appends a term with an id', () => {
    useGlossaryStore.getState().addTerm('  inference  ')
    const terms = useGlossaryStore.getState().terms
    expect(terms).toHaveLength(1)
    expect(terms[0].label).toBe('inference')
    expect(terms[0].id).toBeTruthy()
  })

  it('ignores an empty / whitespace-only label', () => {
    useGlossaryStore.getState().addTerm('   ')
    useGlossaryStore.getState().addTerm('')
    expect(useGlossaryStore.getState().terms).toHaveLength(0)
  })

  it('de-dupes case-insensitively (keeps the first, rejects the duplicate)', () => {
    useGlossaryStore.getState().addTerm('API')
    useGlossaryStore.getState().addTerm('api')
    useGlossaryStore.getState().addTerm('Api')
    const terms = useGlossaryStore.getState().terms
    expect(terms).toHaveLength(1)
    expect(terms[0].label).toBe('API') // first wins
  })

  it('removeTerm removes by id, leaving others', () => {
    useGlossaryStore.getState().addTerm('alpha')
    useGlossaryStore.getState().addTerm('beta')
    const id = useGlossaryStore.getState().terms[0].id
    useGlossaryStore.getState().removeTerm(id)
    expect(useGlossaryStore.getState().terms.map((t) => t.label)).toEqual(['beta'])
  })

  it('reset clears all terms', () => {
    useGlossaryStore.getState().addTerm('alpha')
    useGlossaryStore.getState().reset()
    expect(useGlossaryStore.getState().terms).toEqual([])
  })
})

describe('persist helpers', () => {
  it('migrateGlossary discards an older version', () => {
    expect(migrateGlossary({ terms: [] }, 0)).toBeUndefined()
  })
  it('migrateGlossary passes through current version', () => {
    const state = { terms: [] as Term[] }
    expect(migrateGlossary(state, 1)).toBe(state)
  })
  it('partializeGlossary persists only terms', () => {
    expect(partializeGlossary({ terms: [{ id: 'g1', label: 'x' }] } as never)).toEqual({
      terms: [{ id: 'g1', label: 'x' }],
    })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useGlossaryStore,
  migrateGlossary,
  partializeGlossary,
  __resetGlossaryIds,
  __useRandomGlossaryIds,
  __setGlossaryClock,
  type Term,
} from './glossaryStore'

let t = 1000
beforeEach(() => {
  __resetGlossaryIds()
  t = 1000
  __setGlossaryClock(() => ++t)
  useGlossaryStore.getState().reset()
})

describe('glossary id uniqueness (bug #55)', () => {
  it('mints collision-free term ids across reloads — production uses crypto.randomUUID, not a resettable counter', () => {
    __useRandomGlossaryIds()
    useGlossaryStore.getState().addTerm('alpha')
    const first = useGlossaryStore.getState().terms[0].id
    __useRandomGlossaryIds() // a reload re-initializes the generator
    useGlossaryStore.getState().addTerm('beta')
    const afterReload = useGlossaryStore.getState().terms[1].id
    expect(afterReload).not.toBe(first) // the counter bug re-issued 'g1' here → collision
    expect(first).toMatch(/^g_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) // g_ + v4 uuid
  })
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

  it('addTerm stamps the sync envelope (createdAt=updatedAt, deletedAt:null)', () => {
    useGlossaryStore.getState().addTerm('inference')
    const term = useGlossaryStore.getState().terms[0]
    expect(term.createdAt).toBe(term.updatedAt) // both stamped from one clock read
    expect(term.deletedAt).toBeNull()
  })
})

describe('persist helpers', () => {
  it('migrateGlossary discards an older/unknown version (→ undefined → defaults)', () => {
    expect(migrateGlossary({ terms: [] }, 0)).toBeUndefined()
  })
  it('migrateGlossary passes through current version (v2) by reference', () => {
    const state = { terms: [] as Term[] }
    expect(migrateGlossary(state, 2)).toBe(state)
  })
  it('migrateGlossary backfills v1 → v2: each term gains createdAt=updatedAt=0 and deletedAt:null', () => {
    // v1 terms carry no timestamp; backfill 0 (deterministic legacy/unknown-time sentinel, LWW-safe).
    const migrated = migrateGlossary({ terms: [{ id: 'g1', label: 'API' }] }, 1) as { terms: Term[] }
    expect(migrated.terms[0]).toMatchObject({ id: 'g1', label: 'API', createdAt: 0, updatedAt: 0, deletedAt: null })
  })
  it('migrateGlossary v1 → v2: empty terms array yields an empty store', () => {
    expect(migrateGlossary({ terms: [] }, 1)).toEqual({ terms: [] })
  })
  it('migrateGlossary v1 → v2: a non-array terms field is too broken to salvage → undefined', () => {
    expect(migrateGlossary({ terms: 'nope' }, 1)).toBeUndefined()
    expect(migrateGlossary({}, 1)).toBeUndefined()
  })
  it('migrateGlossary v1 → v2: a non-object top level → undefined (never throws)', () => {
    expect(migrateGlossary(null, 1)).toBeUndefined()
    expect(migrateGlossary(42, 1)).toBeUndefined()
  })
  it('migrateGlossary v1 → v2: a null/garbage term entry is skipped, the rest salvaged', () => {
    const migrated = migrateGlossary({ terms: [null, { id: 'g1', label: 'ok' }, 5] }, 1) as { terms: Term[] }
    expect(migrated.terms).toHaveLength(1)
    expect(migrated.terms[0]).toMatchObject({ id: 'g1', label: 'ok', createdAt: 0, updatedAt: 0, deletedAt: null })
  })
  it.each([
    { desc: 'non-string id', term: { id: 1, label: 'ok' } },
    { desc: 'non-string label', term: { id: 'g1', label: 2 } },
  ])('migrateGlossary v1 → v2: skips a term with $desc (a non-string label would crash addTerm/extractTerms)', ({ term }) => {
    const migrated = migrateGlossary({ terms: [term, { id: 'g9', label: 'good' }] }, 1) as { terms: Term[] }
    expect(migrated.terms.map((t) => t.id)).toEqual(['g9'])
  })
  it('partializeGlossary persists only terms', () => {
    // Call with a genuine GlossaryState (the live store) — no cast.
    useGlossaryStore.getState().addTerm('x')
    const persisted = partializeGlossary(useGlossaryStore.getState())
    expect(Object.keys(persisted)).toEqual(['terms'])
    expect(persisted.terms).toBe(useGlossaryStore.getState().terms)
  })
})

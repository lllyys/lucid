import { describe, it, expect } from 'vitest'
import { buildSeedFromLocal } from './seed'
import type { Session } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'

const session = (over: Partial<Session> = {}): Session => ({
  id: 's1',
  name: 'Doc',
  createdAt: 10,
  updatedAt: 12,
  deletedAt: null,
  tasks: [],
  ...over,
})

describe('buildSeedFromLocal', () => {
  it('returns no ops for an empty workspace', () => {
    expect(buildSeedFromLocal({ sessions: [], terms: [], keywords: [] })).toEqual([])
  })

  it('maps a session to one session op (payload excludes tasks) with baseRev 0 + the envelope', () => {
    const ops = buildSeedFromLocal({ sessions: [session()], terms: [], keywords: [] })
    expect(ops).toEqual([
      { type: 'session', id: 's1', payload: { name: 'Doc', createdAt: 10 }, updatedAt: 12, deletedAt: null, baseRev: 0 },
    ])
  })

  it('flattens each task into its OWN op keyed by sessionId (not embedded in the session blob)', () => {
    const ops = buildSeedFromLocal({
      sessions: [
        session({
          tasks: [
            { id: 't1', kind: 'translate', title: 'Hi', sourceText: 'Hi', resultText: '你好', createdAt: 11, updatedAt: 11, deletedAt: null },
            { id: 't2', kind: 'polish', title: 'Yo', sourceText: 'Yo', resultText: 'Yo!', createdAt: 13, updatedAt: 20, deletedAt: 21 },
          ],
        }),
      ],
      terms: [],
      keywords: [],
    })
    expect(ops).toContainEqual({
      type: 'task',
      id: 't1',
      payload: { kind: 'translate', title: 'Hi', sourceText: 'Hi', resultText: '你好', sessionId: 's1', createdAt: 11 },
      updatedAt: 11,
      deletedAt: null,
      baseRev: 0,
    })
    // task carries its own envelope (incl. a tombstone) — not the session's
    expect(ops).toContainEqual({
      type: 'task',
      id: 't2',
      payload: { kind: 'polish', title: 'Yo', sourceText: 'Yo', resultText: 'Yo!', sessionId: 's1', createdAt: 13 },
      updatedAt: 20,
      deletedAt: 21,
      baseRev: 0,
    })
    expect(ops.filter((o) => o.type === 'session')).toHaveLength(1)
    expect(ops.filter((o) => o.type === 'task')).toHaveLength(2)
  })

  it('maps a glossary term to a term op {label, createdAt}', () => {
    const terms: Term[] = [{ id: 'g1', label: 'API', createdAt: 5, updatedAt: 5, deletedAt: null }]
    const ops = buildSeedFromLocal({ sessions: [], terms, keywords: [] })
    expect(ops).toEqual([
      { type: 'term', id: 'g1', payload: { label: 'API', createdAt: 5 }, updatedAt: 5, deletedAt: null, baseRev: 0 },
    ])
  })

  it('maps a keyword to a keyword op {value} (no createdAt — keywords have none)', () => {
    const keywords: Keyword[] = [{ id: 'kw_x', value: 'inference', updatedAt: 7, deletedAt: null }]
    const ops = buildSeedFromLocal({ sessions: [], terms: [], keywords })
    expect(ops).toEqual([
      { type: 'keyword', id: 'kw_x', payload: { value: 'inference' }, updatedAt: 7, deletedAt: null, baseRev: 0 },
    ])
  })

  it('seeds every kind together; every op is expect-new (baseRev 0)', () => {
    const ops = buildSeedFromLocal({
      sessions: [session({ tasks: [{ id: 't1', kind: 'translate', title: 'a', sourceText: 'a', resultText: '', createdAt: 1, updatedAt: 1, deletedAt: null }] })],
      terms: [{ id: 'g1', label: 'x', createdAt: 1, updatedAt: 1, deletedAt: null }],
      keywords: [{ id: 'kw_y', value: 'y', updatedAt: 1, deletedAt: null }],
    })
    expect(ops).toHaveLength(4) // 1 session + 1 task + 1 term + 1 keyword
    expect(ops.every((o) => o.baseRev === 0)).toBe(true)
  })
})

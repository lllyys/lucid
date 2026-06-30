import { describe, it, expect } from 'vitest'
import { buildSeedFromLocal, collectLocal } from './seed'
import type { Session } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'
import type { StarredItem } from '@/stores/starredStore'

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
    expect(buildSeedFromLocal({ sessions: [], terms: [], keywords: [], starred: [] })).toEqual([])
  })

  it('maps a session to one session op (payload excludes tasks) with baseRev 0 + the envelope', () => {
    const ops = buildSeedFromLocal({ sessions: [session()], terms: [], keywords: [], starred: [] })
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
      starred: [],
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

  it('carries the optional read-view metadata in the task payload (feature #25)', () => {
    const ops = buildSeedFromLocal({
      sessions: [
        session({
          tasks: [
            {
              id: 't1',
              kind: 'translate',
              title: 'Hi',
              sourceText: 'Hi',
              resultText: '你好',
              createdAt: 11,
              updatedAt: 11,
              deletedAt: null,
              sourceLang: 'en',
              targetLang: 'zh',
              durationMs: 1500,
              keywords: ['api', 'latency'],
            },
          ],
        }),
      ],
      terms: [],
      keywords: [],
      starred: [],
    })
    const task = ops.find((o) => o.type === 'task')!
    expect(task.payload).toMatchObject({ sourceLang: 'en', targetLang: 'zh', durationMs: 1500, keywords: ['api', 'latency'] })
  })

  it('maps a glossary term to a term op {label, createdAt}', () => {
    const terms: Term[] = [{ id: 'g1', label: 'API', createdAt: 5, updatedAt: 5, deletedAt: null }]
    const ops = buildSeedFromLocal({ sessions: [], terms, keywords: [], starred: [] })
    expect(ops).toEqual([
      { type: 'term', id: 'g1', payload: { label: 'API', createdAt: 5 }, updatedAt: 5, deletedAt: null, baseRev: 0 },
    ])
  })

  it('maps a keyword to a keyword op {value} (no createdAt — keywords have none)', () => {
    const keywords: Keyword[] = [{ id: 'kw_x', value: 'inference', updatedAt: 7, deletedAt: null }]
    const ops = buildSeedFromLocal({ sessions: [], terms: [], keywords, starred: [] })
    expect(ops).toEqual([
      { type: 'keyword', id: 'kw_x', payload: { value: 'inference' }, updatedAt: 7, deletedAt: null, baseRev: 0 },
    ])
  })

  it('seeds every kind together; every op is expect-new (baseRev 0)', () => {
    const ops = buildSeedFromLocal({
      sessions: [session({ tasks: [{ id: 't1', kind: 'translate', title: 'a', sourceText: 'a', resultText: '', createdAt: 1, updatedAt: 1, deletedAt: null }] })],
      terms: [{ id: 'g1', label: 'x', createdAt: 1, updatedAt: 1, deletedAt: null }],
      keywords: [{ id: 'kw_y', value: 'y', updatedAt: 1, deletedAt: null }],
      starred: [{ id: 'st1', kind: 'word', source: 'cat', translation: 'gato', sourceLang: 'en', targetLang: 'es', createdAt: 1, updatedAt: 1, deletedAt: null }],
    })
    expect(ops).toHaveLength(5) // 1 session + 1 task + 1 term + 1 keyword + 1 starred
    expect(ops.every((o) => o.baseRev === 0)).toBe(true)
  })
})

describe('collectLocal', () => {
  it('returns no entities for an empty workspace', () => {
    expect(collectLocal({ sessions: [], terms: [], keywords: [], starred: [] }, new Map())).toEqual([])
  })

  it('stamps each entity with its last-synced rev from the map, defaulting to 0 when unknown', () => {
    const revs = new Map([['s1', 7]]) // s1 has synced at rev 7; its task t1 is unknown → 0
    const entities = collectLocal(
      {
        sessions: [
          session({
            tasks: [{ id: 't1', kind: 'translate', title: 'a', sourceText: 'a', resultText: '', createdAt: 11, updatedAt: 11, deletedAt: null }],
          }),
        ],
        terms: [],
        keywords: [],
        starred: [],
      },
      revs,
    )
    const byId = Object.fromEntries(entities.map((e) => [e.id, e.rev]))
    expect(byId).toEqual({ s1: 7, t1: 0 }) // known rev preserved; unknown → 0
  })

  it('flattens identically to the seed (session + per-task + term + keyword + starred) but as SyncEntities', () => {
    const entities = collectLocal(
      {
        sessions: [session({ tasks: [{ id: 't1', kind: 'polish', title: 'a', sourceText: 'a', resultText: '', createdAt: 1, updatedAt: 1, deletedAt: null }] })],
        terms: [{ id: 'g1', label: 'API', createdAt: 5, updatedAt: 5, deletedAt: null }] as Term[],
        keywords: [{ id: 'kw_x', value: 'inference', updatedAt: 7, deletedAt: null }] as Keyword[],
        starred: [{ id: 'st1', kind: 'word', source: 'cat', translation: 'gato', sourceLang: 'en', targetLang: 'es', createdAt: 9, updatedAt: 9, deletedAt: null }] as StarredItem[],
      },
      new Map(),
    )
    expect(entities.map((e) => `${e.type}:${e.id}`)).toEqual(['session:s1', 'task:t1', 'term:g1', 'keyword:kw_x', 'starred:st1'])
    const task = entities.find((e) => e.id === 't1')
    expect(task?.payload).toMatchObject({ sessionId: 's1', kind: 'polish' }) // task keyed by sessionId
    expect(entities.every((e) => typeof e.rev === 'number')).toBe(true) // SyncEntity shape (has rev, no baseRev)
  })

  it('emits a starred op carrying the content payload (kind/source/translation/langs/createdAt) at baseRev 0', () => {
    const starred: StarredItem[] = [
      { id: 'st1', kind: 'sentence', source: '世界', translation: 'world', ipa: undefined, meaning: 'the earth', sourceLang: 'zh', targetLang: 'en', context: 'a sentence', createdAt: 5, updatedAt: 8, deletedAt: null },
    ]
    const ops = buildSeedFromLocal({ sessions: [], terms: [], keywords: [], starred })
    expect(ops).toEqual([
      {
        type: 'starred',
        id: 'st1',
        payload: { kind: 'sentence', source: '世界', translation: 'world', ipa: undefined, meaning: 'the earth', sourceLang: 'zh', targetLang: 'en', context: 'a sentence', createdAt: 5 },
        updatedAt: 8,
        deletedAt: null,
        baseRev: 0,
      },
    ])
  })
})

import { describe, it, expect } from 'vitest'
import { diffToOps } from './diff'
import type { LocalSnapshot } from './seed'
import type { Session } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'

const NOW = 1000
const NO_REVS: ReadonlyMap<string, number> = new Map()

const term = (id: string, label: string, updatedAt = 1, deletedAt: number | null = null): Term => ({ id, label, createdAt: 1, updatedAt, deletedAt })
const keyword = (id: string, value: string): Keyword => ({ id, value, updatedAt: 1, deletedAt: null })
const session = (id: string, name: string, tasks: Session['tasks'] = [], updatedAt = 1): Session => ({
  id,
  name,
  createdAt: 1,
  updatedAt,
  deletedAt: null,
  tasks,
})
const task = (id: string, title: string): Session['tasks'][number] => ({
  id,
  kind: 'translate',
  title,
  sourceText: 's',
  resultText: 'r',
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
})

const snap = (over: Partial<LocalSnapshot> = {}): LocalSnapshot => ({ sessions: [], terms: [], keywords: [], starred: [], ...over })

describe('diffToOps', () => {
  it('no change → no ops', () => {
    const s = snap({ terms: [term('g1', 'API')] })
    expect(diffToOps(s, s, NO_REVS, NOW)).toEqual([])
  })

  it('a new entity → an expect-new op (baseRev 0)', () => {
    const ops = diffToOps(snap(), snap({ terms: [term('g1', 'API')] }), NO_REVS, NOW)
    expect(ops).toEqual([{ type: 'term', id: 'g1', payload: { label: 'API', createdAt: 1 }, updatedAt: 1, deletedAt: null, baseRev: 0 }])
  })

  it('a changed payload → an op at the entity’s last-synced baseRev (from the rev map)', () => {
    const prev = snap({ terms: [term('g1', 'API', 1)] })
    const next = snap({ terms: [term('g1', 'API v2', 2)] })
    const ops = diffToOps(prev, next, new Map([['g1', 5]]), NOW)
    expect(ops).toEqual([{ type: 'term', id: 'g1', payload: { label: 'API v2', createdAt: 1 }, updatedAt: 2, deletedAt: null, baseRev: 5 }])
  })

  it('detects an envelope-only change (updatedAt bumped, payload unchanged) — e.g. addTask touches its session', () => {
    const prev = snap({ sessions: [session('s1', 'S', [], 1)] })
    const next = snap({ sessions: [session('s1', 'S', [], 2)] }) // same name/tasks, newer updatedAt
    const ops = diffToOps(prev, next, new Map([['s1', 3]]), NOW)
    expect(ops).toEqual([{ type: 'session', id: 's1', payload: { name: 'S', createdAt: 1 }, updatedAt: 2, deletedAt: null, baseRev: 3 }])
  })

  it('detects a content change even when updatedAt is unchanged (same-ms edits)', () => {
    const prev = snap({ keywords: [keyword('k1', 'old')] })
    const next = snap({ keywords: [{ ...keyword('k1', 'new'), updatedAt: 1 }] }) // same updatedAt, different value
    const ops = diffToOps(prev, next, NO_REVS, NOW)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ type: 'keyword', id: 'k1', payload: { value: 'new' } })
  })

  it('a vanished live entity → a synthesized tombstone op (stores hard-delete) at NOW + its baseRev', () => {
    const prev = snap({ terms: [term('g1', 'API')] })
    const ops = diffToOps(prev, snap(), new Map([['g1', 7]]), NOW)
    expect(ops).toEqual([{ type: 'term', id: 'g1', payload: { label: 'API', createdAt: 1 }, updatedAt: NOW, deletedAt: NOW, baseRev: 7 }])
  })

  it('a vanished ALREADY-tombstoned entity → no op (GC of a prior tombstone, not a new delete)', () => {
    const prev = snap({ terms: [term('g1', 'API', 1, /*deletedAt*/ 500)] })
    expect(diffToOps(prev, snap(), NO_REVS, NOW)).toEqual([])
  })

  it('an in-place tombstone transition (deletedAt set on a still-present entity) → a delete op', () => {
    const prev = snap({ terms: [term('g1', 'API')] })
    const next = snap({ terms: [term('g1', 'API', 2, /*deletedAt*/ 900)] })
    const ops = diffToOps(prev, next, new Map([['g1', 4]]), NOW)
    expect(ops).toEqual([{ type: 'term', id: 'g1', payload: { label: 'API', createdAt: 1 }, updatedAt: 2, deletedAt: 900, baseRev: 4 }])
  })

  it('diffs nested tasks: a new task and a deleted task within a session', () => {
    const prev = snap({ sessions: [session('s1', 'S', [task('t1', 'keep')])] })
    const next = snap({ sessions: [session('s1', 'S', [task('t2', 'added')])] }) // t1 removed, t2 added
    const ops = diffToOps(prev, next, NO_REVS, NOW)
    const byId = Object.fromEntries(ops.map((o) => [o.id, o]))
    expect(byId.t2).toMatchObject({ type: 'task', deletedAt: null, baseRev: 0 }) // added
    expect(byId.t1).toMatchObject({ type: 'task', deletedAt: NOW }) // synthesized tombstone
    expect(ops).toHaveLength(2) // session s1 unchanged → no session op
  })

  it('produces ops across all entity types in one diff', () => {
    const prev = snap({ terms: [term('g1', 'old')] })
    const next = snap({
      sessions: [session('s1', 'New')],
      terms: [term('g1', 'new', 2)],
      keywords: [keyword('k1', 'kw')],
    })
    const ids = diffToOps(prev, next, NO_REVS, NOW).map((o) => o.id).sort()
    expect(ids).toEqual(['g1', 'k1', 's1'])
  })
})

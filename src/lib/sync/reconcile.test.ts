import { describe, it, expect } from 'vitest'
import { reconcileStores } from './reconcile'
import { keywordId } from '@/lib/keywordId'
import type { SyncEntity } from './types'
import type { Session, Task } from '@/stores/sessionStore'
import type { Term } from '@/stores/glossaryStore'
import type { Keyword } from '@/stores/polishKeywordsStore'
import type { StarredItem } from '@/stores/starredStore'

const se = (type: SyncEntity['type'], id: string, payload: Record<string, unknown>, deletedAt: number | null = null): SyncEntity => ({
  type,
  id,
  payload,
  updatedAt: 9,
  deletedAt,
  rev: 1,
})
const sessionE = (id: string, name = 'A', del: number | null = null) => se('session', id, { name, createdAt: 1 }, del)
const taskE = (id: string, sessionId: string, title = 'x', del: number | null = null) =>
  se('task', id, { kind: 'translate', title, sourceText: 'x', resultText: 'y', sessionId, createdAt: 1 }, del)
const termE = (id: string, label = 'API', del: number | null = null) => se('term', id, { label, createdAt: 1 }, del)
const keywordE = (value: string, del: number | null = null) => se('keyword', keywordId(value), { value }, del)
const starredE = (id: string, source = 'cat', del: number | null = null) =>
  se('starred', id, { kind: 'word', source, translation: 'gato', sourceLang: 'en', targetLang: 'es', createdAt: 1 }, del)

const task = (id: string, title = 'orig'): Task => ({ id, kind: 'translate', title, sourceText: 'o', resultText: 'o', createdAt: 0, updatedAt: 0, deletedAt: null })
const session = (id: string, name: string, tasks: Task[] = []): Session => ({ id, name, createdAt: 0, updatedAt: 0, deletedAt: null, tasks })
const starred = (id: string, source = 'cat'): StarredItem => ({
  id,
  kind: 'word',
  source,
  translation: 'orig',
  sourceLang: 'en',
  targetLang: 'es',
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
})
const EMPTY = { sessions: [] as Session[], terms: [] as Term[], keywords: [] as Keyword[], starred: [] as StarredItem[] }

describe('reconcileStores', () => {
  it('returns the current snapshot unchanged for an empty resolved set', () => {
    const cur = { sessions: [session('s1', 'A')], terms: [], keywords: [], starred: [] }
    expect(reconcileStores(cur, [])).toEqual(cur)
  })

  it('adds a new session entity (with empty tasks)', () => {
    const out = reconcileStores(EMPTY, [sessionE('s1', 'New')])
    expect(out.sessions).toEqual([{ id: 's1', name: 'New', createdAt: 1, updatedAt: 9, deletedAt: null, tasks: [] }])
  })

  it('upserts an existing session but PRESERVES its current tasks (the entity payload has none)', () => {
    const cur = { sessions: [session('s1', 'Old', [task('t1')])], terms: [], keywords: [], starred: [] }
    const out = reconcileStores(cur, [sessionE('s1', 'Renamed')])
    expect(out.sessions[0].name).toBe('Renamed')
    expect(out.sessions[0].tasks).toEqual([task('t1')]) // tasks preserved
  })

  it('removes a tombstoned session', () => {
    const cur = { sessions: [session('s1', 'A'), session('s2', 'B')], terms: [], keywords: [], starred: [] }
    const out = reconcileStores(cur, [sessionE('s1', 'A', /*del*/ 5)])
    expect(out.sessions.map((s) => s.id)).toEqual(['s2'])
  })

  it('skips a malformed session entity (bad payload → reconstruct null)', () => {
    const out = reconcileStores(EMPTY, [se('session', 's1', { name: 42, createdAt: 1 })])
    expect(out.sessions).toEqual([])
  })

  it('nests a task into its session — even when the task appears BEFORE its session in the batch (two-pass)', () => {
    const out = reconcileStores(EMPTY, [taskE('t1', 's1'), sessionE('s1', 'A')]) // task first
    expect(out.sessions[0].tasks.map((t) => t.id)).toEqual(['t1'])
    expect(out.sessions[0].tasks[0].title).toBe('x')
  })

  it('replaces an existing task with the same id (upsert)', () => {
    const cur = { sessions: [session('s1', 'A', [task('t1', 'old')])], terms: [], keywords: [], starred: [] }
    const out = reconcileStores(cur, [taskE('t1', 's1', 'new')])
    expect(out.sessions[0].tasks).toHaveLength(1)
    expect(out.sessions[0].tasks[0].title).toBe('new')
  })

  it('removes a tombstoned task from its session, leaving other sessions untouched', () => {
    const cur = {
      sessions: [session('s1', 'A', [task('t1'), task('t2')]), session('s2', 'B', [task('t9')])],
      terms: [],
      keywords: [],
      starred: [],
    }
    const out = reconcileStores(cur, [taskE('t1', 's1', 'x', /*del*/ 5)])
    expect(out.sessions.find((s) => s.id === 's1')?.tasks.map((t) => t.id)).toEqual(['t2'])
    expect(out.sessions.find((s) => s.id === 's2')?.tasks.map((t) => t.id)).toEqual(['t9']) // untouched
  })

  it('skips an orphan task whose session is absent (or was just tombstoned)', () => {
    const out = reconcileStores(EMPTY, [taskE('t1', 'ghost')])
    expect(out.sessions).toEqual([])
    // a task for a session tombstoned in the same batch is also dropped
    const cur = { sessions: [session('s1', 'A')], terms: [], keywords: [], starred: [] }
    const out2 = reconcileStores(cur, [sessionE('s1', 'A', 5), taskE('t1', 's1')])
    expect(out2.sessions).toEqual([])
  })

  it('skips a malformed task entity', () => {
    const cur = { sessions: [session('s1', 'A')], terms: [], keywords: [], starred: [] }
    const out = reconcileStores(cur, [se('task', 't1', { kind: 'nope', sessionId: 's1' })])
    expect(out.sessions[0].tasks).toEqual([])
  })

  it('upserts and tombstones terms; skips malformed', () => {
    const cur = { sessions: [], terms: [{ id: 'g1', label: 'Old', createdAt: 0, updatedAt: 0, deletedAt: null } as Term], keywords: [], starred: [] }
    const out = reconcileStores(cur, [termE('g1', 'New'), termE('g2', 'Added'), se('term', 'g3', { label: 1, createdAt: 1 })])
    expect(out.terms.find((t) => t.id === 'g1')?.label).toBe('New')
    expect(out.terms.map((t) => t.id).sort()).toEqual(['g1', 'g2'])
    const out2 = reconcileStores(cur, [termE('g1', 'Old', /*del*/ 5)])
    expect(out2.terms).toEqual([])
  })

  it('upserts and tombstones keywords; skips malformed', () => {
    const out = reconcileStores(EMPTY, [keywordE('inference')])
    expect(out.keywords).toEqual([{ id: keywordId('inference'), value: 'inference', updatedAt: 9, deletedAt: null }])
    const cur = { sessions: [], terms: [], keywords: out.keywords, starred: [] }
    expect(reconcileStores(cur, [keywordE('inference', /*del*/ 5)]).keywords).toEqual([])
    // malformed (id mismatch) skipped
    expect(reconcileStores(EMPTY, [se('keyword', 'kw_wrong', { value: 'x' })]).keywords).toEqual([])
  })

  it('upserts and tombstones starred items; skips malformed (term path — no id-derivation)', () => {
    const out = reconcileStores(EMPTY, [starredE('st1', 'cat'), starredE('st2', 'dog'), se('starred', 'st3', { kind: 'nope' })])
    expect(out.starred.map((i) => i.id).sort()).toEqual(['st1', 'st2']) // malformed st3 skipped
    expect(out.starred.find((i) => i.id === 'st1')?.source).toBe('cat')
    // delete-wins: tombstoning st1 removes it
    const cur = { sessions: [], terms: [], keywords: [], starred: out.starred }
    expect(reconcileStores(cur, [starredE('st1', 'cat', /*del*/ 5)]).starred.map((i) => i.id)).toEqual(['st2'])
  })

  it('replaces an existing starred item with the same id (upsert)', () => {
    const cur = { sessions: [], terms: [], keywords: [], starred: [starred('st1', 'old')] }
    const out = reconcileStores(cur, [starredE('st1', 'new')])
    expect(out.starred).toHaveLength(1)
    expect(out.starred[0].source).toBe('new')
  })

  it('deletes a starred item on the envelope id even when the tombstone payload is empty', () => {
    const cur = { sessions: [], terms: [], keywords: [], starred: [starred('st1', 'x')] }
    expect(reconcileStores(cur, [se('starred', 'st1', {}, /*del*/ 5)]).starred).toEqual([])
  })

  // delete-wins: a tombstone must delete on the envelope id ALONE — the server may send a minimal
  // (empty) payload for a deletion, which must NOT block the delete (else stale entities stay live).
  it('deletes on the envelope id even when the tombstone payload is empty/malformed', () => {
    const cur = {
      sessions: [session('s1', 'A', [task('t1'), task('t2')])],
      terms: [{ id: 'g1', label: 'X', createdAt: 0, updatedAt: 0, deletedAt: null } as Term],
      keywords: [{ id: keywordId('k'), value: 'k', updatedAt: 0, deletedAt: null } as Keyword],
      starred: [],
    }
    const out = reconcileStores(cur, [
      se('session', 's1', {}, /*del*/ 5), // empty payload + tombstone
      se('term', 'g1', {}, 5),
      se('keyword', keywordId('k'), {}, 5),
    ])
    expect(out.sessions).toEqual([])
    expect(out.terms).toEqual([])
    expect(out.keywords).toEqual([])
  })

  it('deletes a task on the envelope id even when its tombstone payload is empty (no sessionId)', () => {
    const cur = { sessions: [session('s1', 'A', [task('t1'), task('t2')])], terms: [], keywords: [], starred: [] }
    const out = reconcileStores(cur, [se('task', 't1', {}, /*del*/ 5)]) // empty payload, no sessionId
    expect(out.sessions[0].tasks.map((t) => t.id)).toEqual(['t2'])
  })
})

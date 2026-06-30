import { describe, it, expect } from 'vitest'
import { entityToSession, entityToTask, entityToTerm, entityToKeyword, entityToStarred } from './reconstruct'
import { flattenLocal } from './seed'
import { keywordId } from '@/lib/keywordId'
import type { Session, Task } from '@/stores/sessionStore'
import type { SyncEntity } from './types'

const ent = (type: SyncEntity['type'], payload: Record<string, unknown>, over: Partial<SyncEntity> = {}): SyncEntity => ({
  type,
  id: 'x',
  payload,
  updatedAt: 5,
  deletedAt: null,
  rev: 3,
  ...over,
})

describe('entityToSession', () => {
  it('reconstructs a Session (envelope from the entity, name/createdAt from the payload, empty tasks)', () => {
    const s = entityToSession(ent('session', { name: 'Doc', createdAt: 10 }, { id: 's1', updatedAt: 12, deletedAt: 7 }))
    expect(s).toEqual({ id: 's1', name: 'Doc', createdAt: 10, updatedAt: 12, deletedAt: 7, tasks: [] })
  })
  it.each([
    { desc: 'non-string name', p: { name: 1, createdAt: 10 } },
    { desc: 'non-number createdAt', p: { name: 'Doc', createdAt: 'x' } },
    { desc: 'non-finite createdAt (Infinity from JSON)', p: { name: 'Doc', createdAt: Infinity } },
    { desc: 'negative createdAt', p: { name: 'Doc', createdAt: -1 } },
  ])('returns null for a malformed payload: $desc', ({ p }) => {
    expect(entityToSession(ent('session', p))).toBeNull()
  })
})

describe('entityToTask', () => {
  const valid = { kind: 'translate', title: 'Hi', sourceText: 'Hi', resultText: '你好', sessionId: 's1', createdAt: 11 }
  it('reconstructs a Task + its sessionId (re-nesting key)', () => {
    const r = entityToTask(ent('task', valid, { id: 't1', updatedAt: 11, deletedAt: null }))
    expect(r).toEqual({
      task: { id: 't1', kind: 'translate', title: 'Hi', sourceText: 'Hi', resultText: '你好', createdAt: 11, updatedAt: 11, deletedAt: null },
      sessionId: 's1',
    })
  })
  it('accepts polish kind', () => {
    expect(entityToTask(ent('task', { ...valid, kind: 'polish' }))?.task.kind).toBe('polish')
  })
  it('carries the optional read-view metadata when present (feature #25)', () => {
    const r = entityToTask(ent('task', { ...valid, sourceLang: 'en', targetLang: 'zh', durationMs: 1500, keywords: ['api', 'latency'] }))
    expect(r?.task).toMatchObject({ sourceLang: 'en', targetLang: 'zh', durationMs: 1500, keywords: ['api', 'latency'] })
  })
  it('reconstructs the optional metadata as undefined when absent (old/synced degrade, no clobber)', () => {
    const r = entityToTask(ent('task', valid))
    expect(r?.task.sourceLang).toBeUndefined()
    expect(r?.task.targetLang).toBeUndefined()
    expect(r?.task.durationMs).toBeUndefined()
    expect(r?.task.keywords).toBeUndefined()
  })
  it.each([
    { desc: 'invalid kind', p: { ...valid, kind: 'summarize' } },
    { desc: 'non-string title', p: { ...valid, title: 1 } },
    { desc: 'non-string sourceText', p: { ...valid, sourceText: 2 } },
    { desc: 'non-string resultText', p: { ...valid, resultText: 3 } },
    { desc: 'non-string sessionId', p: { ...valid, sessionId: null } },
    { desc: 'empty sessionId (orphan task)', p: { ...valid, sessionId: '' } },
    { desc: 'non-number createdAt', p: { ...valid, createdAt: 'x' } },
    { desc: 'non-finite createdAt', p: { ...valid, createdAt: Infinity } },
    { desc: 'non-string sourceLang when present', p: { ...valid, sourceLang: 1 } },
    { desc: 'non-string targetLang when present', p: { ...valid, targetLang: 2 } },
    { desc: 'non-number durationMs when present', p: { ...valid, durationMs: 'x' } },
    { desc: 'negative durationMs', p: { ...valid, durationMs: -1 } },
    { desc: 'non-finite durationMs (Infinity from JSON)', p: { ...valid, durationMs: Infinity } },
    { desc: 'non-array keywords when present', p: { ...valid, keywords: 'api' } },
    { desc: 'keywords array with a non-string element', p: { ...valid, keywords: ['api', 3] } },
  ])('returns null for a malformed payload: $desc', ({ p }) => {
    expect(entityToTask(ent('task', p))).toBeNull()
  })
})

describe('task metadata sync round-trip (feature #25)', () => {
  const sessionWith = (task: Task): Session => ({ id: 's1', name: 'Doc', createdAt: 10, updatedAt: 11, deletedAt: null, tasks: [task] })
  const taskEntity = (task: Task): SyncEntity => {
    const flat = flattenLocal({ sessions: [sessionWith(task)], terms: [], keywords: [], starred: [] }).find((e) => e.type === 'task')!
    return { ...flat, rev: 0 }
  }
  const base: Task = { id: 't1', kind: 'translate', title: 'Hi', sourceText: 'Hi', resultText: '你好', createdAt: 11, updatedAt: 11, deletedAt: null }

  it('a task WITH metadata survives flattenLocal → entityToTask intact', () => {
    const r = entityToTask(taskEntity({ ...base, sourceLang: 'en', targetLang: 'zh', durationMs: 1500, keywords: ['api'] }))
    expect(r?.task).toMatchObject({ sourceLang: 'en', targetLang: 'zh', durationMs: 1500, keywords: ['api'] })
    expect(r?.sessionId).toBe('s1')
  })
  it('a task WITHOUT metadata reconstructs cleanly — fields stay undefined (no clobber)', () => {
    const r = entityToTask(taskEntity(base))
    expect(r).not.toBeNull()
    expect(r?.task.sourceLang).toBeUndefined()
    expect(r?.task.keywords).toBeUndefined()
    expect(r?.task.durationMs).toBeUndefined()
  })
})

describe('entityToTerm', () => {
  it('reconstructs a Term', () => {
    expect(entityToTerm(ent('term', { label: 'API', createdAt: 5 }, { id: 'g1' }))).toEqual({
      id: 'g1',
      label: 'API',
      createdAt: 5,
      updatedAt: 5,
      deletedAt: null,
    })
  })
  it.each([
    { desc: 'non-string label', p: { label: 1, createdAt: 5 } },
    { desc: 'non-number createdAt', p: { label: 'API', createdAt: 'x' } },
  ])('returns null for a malformed payload: $desc', ({ p }) => {
    expect(entityToTerm(ent('term', p))).toBeNull()
  })
})

describe('entityToKeyword', () => {
  it('reconstructs a Keyword (no createdAt) when the id matches keywordId(value)', () => {
    const id = keywordId('inference')
    expect(entityToKeyword(ent('keyword', { value: 'inference' }, { id, updatedAt: 7 }))).toEqual({
      id,
      value: 'inference',
      updatedAt: 7,
      deletedAt: null,
    })
  })
  it.each([
    { desc: 'non-string value', e: ent('keyword', { value: 42 }, { id: keywordId('x') }) },
    { desc: 'empty value', e: ent('keyword', { value: '' }, { id: keywordId('') }) },
    { desc: 'id that does not match keywordId(value) (breaks convergence)', e: ent('keyword', { value: 'inference' }, { id: 'kw_wrong' }) },
  ])('returns null for $desc', ({ e }) => {
    expect(entityToKeyword(e)).toBeNull()
  })
})

describe('entityToStarred', () => {
  const valid = { kind: 'word', source: 'cat', translation: 'gato', sourceLang: 'en', targetLang: 'es', createdAt: 5 }
  it('reconstructs a StarredItem (envelope from the entity, content from the payload; no id-derivation)', () => {
    expect(entityToStarred(ent('starred', valid, { id: 'st1', updatedAt: 7, deletedAt: 9 }))).toEqual({
      id: 'st1',
      kind: 'word',
      source: 'cat',
      translation: 'gato',
      sourceLang: 'en',
      targetLang: 'es',
      createdAt: 5,
      updatedAt: 7,
      deletedAt: 9,
    })
  })
  it('accepts the sentence kind and carries optional ipa/meaning/context when present', () => {
    const r = entityToStarred(ent('starred', { ...valid, kind: 'sentence', ipa: 'kæt', meaning: 'a feline', context: 'The cat sat.' }))
    expect(r).toMatchObject({ kind: 'sentence', ipa: 'kæt', meaning: 'a feline', context: 'The cat sat.' })
  })
  it.each([
    { desc: 'invalid kind', p: { ...valid, kind: 'phrase' } },
    { desc: 'non-string source', p: { ...valid, source: 1 } },
    { desc: 'non-string translation', p: { ...valid, translation: 2 } },
    { desc: 'non-string sourceLang', p: { ...valid, sourceLang: null } },
    { desc: 'non-string targetLang', p: { ...valid, targetLang: 3 } },
    { desc: 'non-number createdAt', p: { ...valid, createdAt: 'x' } },
    { desc: 'non-finite createdAt (Infinity from JSON)', p: { ...valid, createdAt: Infinity } },
    { desc: 'non-string ipa when present', p: { ...valid, ipa: 4 } },
    { desc: 'non-string meaning when present', p: { ...valid, meaning: 5 } },
    { desc: 'non-string context when present', p: { ...valid, context: 6 } },
  ])('returns null for a malformed payload: $desc', ({ p }) => {
    expect(entityToStarred(ent('starred', p))).toBeNull()
  })
})

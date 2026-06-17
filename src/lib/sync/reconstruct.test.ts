import { describe, it, expect } from 'vitest'
import { entityToSession, entityToTask, entityToTerm, entityToKeyword } from './reconstruct'
import { keywordId } from '@/lib/keywordId'
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
  it.each([
    { desc: 'invalid kind', p: { ...valid, kind: 'summarize' } },
    { desc: 'non-string title', p: { ...valid, title: 1 } },
    { desc: 'non-string sourceText', p: { ...valid, sourceText: 2 } },
    { desc: 'non-string resultText', p: { ...valid, resultText: 3 } },
    { desc: 'non-string sessionId', p: { ...valid, sessionId: null } },
    { desc: 'empty sessionId (orphan task)', p: { ...valid, sessionId: '' } },
    { desc: 'non-number createdAt', p: { ...valid, createdAt: 'x' } },
    { desc: 'non-finite createdAt', p: { ...valid, createdAt: Infinity } },
  ])('returns null for a malformed payload: $desc', ({ p }) => {
    expect(entityToTask(ent('task', p))).toBeNull()
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

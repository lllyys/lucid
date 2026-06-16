import { describe, it, expect } from 'vitest'
import { isEntityType, isSyncEntity, isPullResult, isPushResult } from './guards'
import type { SyncEntity } from './types'

const entity: SyncEntity = {
  type: 'keyword',
  id: 'kw_x',
  payload: { value: 'inference' },
  updatedAt: 5,
  deletedAt: null,
  rev: 3,
}

describe('isEntityType', () => {
  it.each(['session', 'task', 'term', 'keyword'])('accepts %s', (t) => {
    expect(isEntityType(t)).toBe(true)
  })
  it.each(['', 'sessions', 42, null, undefined])('rejects %s', (t) => {
    expect(isEntityType(t)).toBe(false)
  })
})

describe('isSyncEntity', () => {
  it('accepts a well-formed entity (live and tombstoned)', () => {
    expect(isSyncEntity(entity)).toBe(true)
    expect(isSyncEntity({ ...entity, deletedAt: 99 })).toBe(true)
  })
  it.each([
    { desc: 'not a record', v: null },
    { desc: 'bad type', v: { ...entity, type: 'nope' } },
    { desc: 'non-string id', v: { ...entity, id: 1 } },
    { desc: 'non-object payload', v: { ...entity, payload: 'x' } },
    { desc: 'array payload', v: { ...entity, payload: [] } },
    { desc: 'non-number updatedAt', v: { ...entity, updatedAt: 'x' } },
    { desc: 'fractional updatedAt', v: { ...entity, updatedAt: 1.5 } },
    { desc: 'negative updatedAt', v: { ...entity, updatedAt: -1 } },
    { desc: 'deletedAt neither null nor number', v: { ...entity, deletedAt: 'x' } },
    { desc: 'non-number rev', v: { ...entity, rev: 'x' } },
    { desc: 'fractional rev', v: { ...entity, rev: 1.5 } },
    { desc: 'non-positive rev', v: { ...entity, rev: 0 } },
    { desc: 'unsafe-integer rev (precision lost above 2^53)', v: { ...entity, rev: Number.MAX_SAFE_INTEGER + 1 } },
    { desc: 'unsafe-integer updatedAt', v: { ...entity, updatedAt: Number.MAX_SAFE_INTEGER + 1 } },
  ])('rejects $desc', ({ v }) => {
    expect(isSyncEntity(v)).toBe(false)
  })
})

describe('isPullResult', () => {
  it('accepts a well-formed pull result', () => {
    expect(isPullResult({ changes: [entity], maxRev: 3 })).toBe(true)
    expect(isPullResult({ changes: [], maxRev: 0 })).toBe(true)
  })
  it.each([
    { desc: 'not a record', v: null },
    { desc: 'non-array changes', v: { changes: 'x', maxRev: 0 } },
    { desc: 'a bad entity in changes', v: { changes: [entity, { bad: true }], maxRev: 0 } },
    { desc: 'non-number maxRev', v: { changes: [], maxRev: 'x' } },
    { desc: 'negative maxRev', v: { changes: [], maxRev: -1 } },
    { desc: 'unsafe-integer maxRev', v: { changes: [], maxRev: Number.MAX_SAFE_INTEGER + 1 } },
  ])('rejects $desc', ({ v }) => {
    expect(isPullResult(v)).toBe(false)
  })
})

describe('isPushResult', () => {
  it('accepts applied and conflict (conflict server id matches the op id)', () => {
    expect(isPushResult({ status: 'applied', id: 'a', rev: 4 })).toBe(true)
    expect(isPushResult({ status: 'conflict', id: entity.id, server: entity })).toBe(true)
  })
  it.each([
    { desc: 'not a record', v: null },
    { desc: 'non-string id', v: { status: 'applied', id: 1, rev: 4 } },
    { desc: 'applied without a positive-integer rev', v: { status: 'applied', id: 'a', rev: 'x' } },
    { desc: 'applied with a zero rev', v: { status: 'applied', id: 'a', rev: 0 } },
    { desc: 'conflict with a bad server entity', v: { status: 'conflict', id: 'a', server: { bad: true } } },
    { desc: 'conflict whose server id mismatches the op id', v: { status: 'conflict', id: 'a', server: entity } },
    { desc: 'unknown status', v: { status: 'weird', id: 'a' } },
  ])('rejects $desc', ({ v }) => {
    expect(isPushResult(v)).toBe(false)
  })
})

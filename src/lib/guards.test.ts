import { describe, it, expect } from 'vitest'
import { isRecord, isNonNegInt } from './guards'

describe('isRecord', () => {
  it('is true for a plain object', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
  })
  it('is true for an array (callers pair it with Array.isArray when they need a non-array record)', () => {
    expect(isRecord([])).toBe(true)
  })
  it('is false for null', () => {
    expect(isRecord(null)).toBe(false)
  })
  it('is false for non-objects', () => {
    expect(isRecord(undefined)).toBe(false)
    expect(isRecord(42)).toBe(false)
    expect(isRecord('x')).toBe(false)
  })
})

describe('isNonNegInt', () => {
  it('is true for non-negative safe integers (including 0)', () => {
    expect(isNonNegInt(0)).toBe(true)
    expect(isNonNegInt(42)).toBe(true)
    expect(isNonNegInt(Number.MAX_SAFE_INTEGER)).toBe(true)
  })
  it.each([
    { d: 'negative', v: -1 },
    { d: 'fraction', v: 1.5 },
    { d: 'NaN', v: NaN },
    { d: 'Infinity', v: Infinity },
    { d: 'past 2^53', v: Number.MAX_SAFE_INTEGER + 1 },
    { d: 'string', v: '5' },
    { d: 'null', v: null },
  ])('is false for $d', ({ v }) => {
    expect(isNonNegInt(v)).toBe(false)
  })
})

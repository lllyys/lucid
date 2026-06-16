import { describe, it, expect } from 'vitest'
import { isRecord } from './guards'

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

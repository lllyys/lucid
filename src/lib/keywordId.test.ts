import { describe, it, expect } from 'vitest'
import { keywordId } from './keywordId'

describe('keywordId', () => {
  it('is deterministic — the same value always yields the same id (cross-device convergence)', () => {
    expect(keywordId('inference')).toBe(keywordId('inference'))
  })
  it('distinguishes different values', () => {
    expect(keywordId('inference')).not.toBe(keywordId('attention'))
  })
  it('is collision-free — distinct values never share an id (regression: these collided under a 32-bit hash)', () => {
    // 'dgackrhf' and 'xlellzqn' both hashed to the same djb2 id; an encoded id cannot collide, so a
    // sync layer keyed on id will never merge two distinct keywords into one entity.
    expect(keywordId('dgackrhf')).not.toBe(keywordId('xlellzqn'))
  })
  it('never throws on a lone surrogate and keeps distinct surrogates distinct (encodeURIComponent would throw)', () => {
    expect(() => keywordId('\uD800')).not.toThrow()
    expect(keywordId('\uD800')).not.toBe(keywordId('\uD801'))
  })
})

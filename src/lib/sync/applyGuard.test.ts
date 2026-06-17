import { describe, it, expect } from 'vitest'
import { isApplyingSync, runSuppressed } from './applyGuard'

describe('applyGuard', () => {
  it('is not suppressing outside runSuppressed', () => {
    expect(isApplyingSync()).toBe(false)
  })

  it('suppresses for the duration of the callback and restores afterwards', () => {
    let inside = false
    const result = runSuppressed(() => {
      inside = isApplyingSync()
      return 42
    })
    expect(inside).toBe(true)
    expect(result).toBe(42)
    expect(isApplyingSync()).toBe(false)
  })

  it('restores the PRIOR state on nested calls (not a hard false)', () => {
    runSuppressed(() => {
      runSuppressed(() => {})
      expect(isApplyingSync()).toBe(true) // inner call restored to the outer's true, not false
    })
    expect(isApplyingSync()).toBe(false)
  })

  it('restores even if the callback throws', () => {
    expect(() => runSuppressed(() => { throw new Error('boom') })).toThrow('boom')
    expect(isApplyingSync()).toBe(false)
  })
})

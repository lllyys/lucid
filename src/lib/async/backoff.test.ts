import { describe, it, expect, afterEach, vi } from 'vitest'
import { realSleep, clampMs, expBackoff } from './backoff'

describe('realSleep', () => {
  afterEach(() => vi.useRealTimers())

  it('resolves immediately for an already-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(realSleep(10_000, ac.signal)).resolves.toBeUndefined()
  })
  it('resolves after the delay elapses', async () => {
    vi.useFakeTimers()
    let done = false
    const p = realSleep(50).then(() => {
      done = true
    })
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    await p
    expect(done).toBe(true)
  })
  it('resolves early when the signal aborts during the wait', async () => {
    const ac = new AbortController()
    const p = realSleep(10_000, ac.signal)
    ac.abort()
    await expect(p).resolves.toBeUndefined()
  })
})

describe('clampMs', () => {
  it('passes a finite in-range value through', () => {
    expect(clampMs(500, 30_000)).toBe(500)
  })
  it('caps at max', () => {
    expect(clampMs(99_999, 30_000)).toBe(30_000)
  })
  it('coerces a negative or non-finite value to 0', () => {
    expect(clampMs(-5, 30_000)).toBe(0)
    expect(clampMs(Infinity, 30_000)).toBe(0)
    expect(clampMs(NaN, 30_000)).toBe(0)
  })
})

describe('expBackoff', () => {
  it('grows exponentially from base, scaled by the jitter source', () => {
    const r = () => 1 // full jitter
    expect(expBackoff(0, 500, 30_000, r)).toBe(500) // 500 * 2^0
    expect(expBackoff(1, 500, 30_000, r)).toBe(1000) // 500 * 2^1
    expect(expBackoff(2, 500, 30_000, r)).toBe(2000) // 500 * 2^2
  })
  it('applies the jitter fraction', () => {
    expect(expBackoff(2, 500, 30_000, () => 0.5)).toBe(1000) // 0.5 * 2000
  })
  it('clamps the exponential to max before jitter', () => {
    expect(expBackoff(20, 500, 30_000, () => 1)).toBe(30_000) // 500*2^20 capped at 30_000
  })
})

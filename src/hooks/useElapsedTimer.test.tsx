import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useElapsedTimer } from './useElapsedTimer'

// vi fake timers mock Date.now to follow the fake clock, so advanceTimersByTime advances
// both the interval AND Date.now — advance alone, don't also call setSystemTime.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useElapsedTimer', () => {
  it('accumulates elapsed time while running', () => {
    const { result } = renderHook(() => useElapsedTimer(0, true))
    expect(result.current).toBe(0)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(500)
  })

  it('does not tick when not running or when startedAt is null', () => {
    const a = renderHook(() => useElapsedTimer(0, false))
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(a.result.current).toBe(0)

    const b = renderHook(() => useElapsedTimer(null, true))
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(b.result.current).toBe(0)
  })

  it('cleans up the interval on unmount (freezes, no further ticks)', () => {
    const { result, unmount } = renderHook(() => useElapsedTimer(0, true))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe(200)
    unmount()
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(result.current).toBe(200)
  })
})

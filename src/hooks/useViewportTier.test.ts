import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useViewportTier } from './useViewportTier'

// WI-1 — useViewportTier resolves the responsive tier from matchMedia synchronously.
// The global setup.ts stub is matches:false / no-op and CANNOT drive tier-varying or
// cleanup assertions — install a per-test query-aware matchMedia (matches computed from
// the queried min-width vs a fake viewport width), saving/restoring window.matchMedia
// per test (à la src/App.test.tsx:79-92).

const realMatchMedia = window.matchMedia

type Listener = (e: MediaQueryListEvent) => void

/** Install a matchMedia whose `matches` is computed from the queried `(min-width: Npx)` vs `width`. */
function installMatchMedia(width: number) {
  const add = vi.fn()
  const remove = vi.fn()
  window.matchMedia = ((query: string) => {
    const m = /min-width:\s*(\d+)px/.exec(query)
    const min = m ? Number(m[1]) : 0
    return {
      matches: width >= min,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener: add as (type: string, l: Listener) => void,
      removeEventListener: remove as (type: string, l: Listener) => void,
      dispatchEvent() {
        return false
      },
    }
  }) as unknown as typeof window.matchMedia
  return { add, remove }
}

afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
})

describe('useViewportTier', () => {
  it.each([
    { width: 1200, tier: 'desktop' },
    { width: 960, tier: 'desktop' }, // exact 960 boundary → desktop
    { width: 959, tier: 'tablet' },
    { width: 800, tier: 'tablet' },
    { width: 600, tier: 'tablet' }, // exact 600 boundary → tablet
    { width: 599, tier: 'phone' },
    { width: 390, tier: 'phone' },
    { width: 0, tier: 'phone' },
  ])('width=$width → $tier', ({ width, tier }) => {
    installMatchMedia(width)
    const { result } = renderHook(() => useViewportTier())
    expect(result.current).toBe(tier)
  })

  it('computes the initial tier synchronously on first render (no post-mount flash)', () => {
    installMatchMedia(390)
    const seen: string[] = []
    renderHook(() => {
      const tier = useViewportTier()
      seen.push(tier)
      return tier
    })
    // The very first render already reports phone — no desktop→phone correction.
    expect(seen[0]).toBe('phone')
  })

  it('defaults to desktop when matchMedia reports no match (jsdom stub)', () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    })) as unknown as typeof window.matchMedia
    const { result } = renderHook(() => useViewportTier())
    expect(result.current).toBe('desktop')
  })

  it('subscribes on mount and removes its listeners on unmount', () => {
    const { add, remove } = installMatchMedia(390)
    const { unmount } = renderHook(() => useViewportTier())
    expect(add).toHaveBeenCalled()
    unmount()
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length)
  })

  it('survives an environment without matchMedia (defaults to desktop)', () => {
    // @ts-expect-error — simulate a runtime with no matchMedia
    window.matchMedia = undefined
    const { result } = renderHook(() => useViewportTier())
    expect(result.current).toBe('desktop')
  })
})

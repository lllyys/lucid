import { describe, it, expect, vi } from 'vitest'
import { createSafeJSONStorage } from './safeJSONStorage'

/** Minimal in-memory Storage for tests (the vitest env has no real localStorage). */
function mockStorage(overrides: Partial<Storage> = {}): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    ...overrides,
  }
}

describe('createSafeJSONStorage', () => {
  it('round-trips a valid value', () => {
    const backend = mockStorage()
    const s = createSafeJSONStorage({ backend: () => backend })
    s.setItem('k', '{"a":1}')
    expect(s.getItem('k')).toBe('{"a":1}')
  })

  it('returns null for an absent key', () => {
    const s = createSafeJSONStorage({ backend: () => mockStorage() })
    expect(s.getItem('missing')).toBeNull()
  })

  it('discards corrupt JSON (returns null, never throws)', () => {
    const backend = mockStorage()
    backend.setItem('k', '{not valid json')
    const s = createSafeJSONStorage({ backend: () => backend })
    expect(s.getItem('k')).toBeNull()
  })

  it('discards an oversized blob (> maxBytes)', () => {
    const backend = mockStorage()
    backend.setItem('k', JSON.stringify('x'.repeat(50)))
    const s = createSafeJSONStorage({ backend: () => backend, maxBytes: 10 })
    expect(s.getItem('k')).toBeNull()
  })

  it('no-ops in a non-browser context (backend null) without throwing', () => {
    const s = createSafeJSONStorage({ backend: () => null })
    expect(s.getItem('k')).toBeNull()
    expect(() => s.setItem('k', 'v')).not.toThrow()
    expect(() => s.removeItem('k')).not.toThrow()
  })

  it('swallows a quota error on write and reports it via onWriteError', () => {
    const onWriteError = vi.fn()
    const backend = mockStorage({
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    })
    const s = createSafeJSONStorage({ backend: () => backend, onWriteError })
    expect(() => s.setItem('k', 'v')).not.toThrow()
    expect(onWriteError).toHaveBeenCalledOnce()
  })

  it('swallows a read error from the backend', () => {
    const backend = mockStorage({
      getItem: () => {
        throw new Error('SecurityError')
      },
    })
    const s = createSafeJSONStorage({ backend: () => backend })
    expect(s.getItem('k')).toBeNull()
  })

  it('removeItem delegates and swallows errors', () => {
    const backend = mockStorage()
    backend.setItem('k', '"v"')
    const s = createSafeJSONStorage({ backend: () => backend })
    s.removeItem('k')
    expect(backend.getItem('k')).toBeNull()
  })

  describe('default backend (window.localStorage)', () => {
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage')
    const restore = () => {
      if (orig) Object.defineProperty(window, 'localStorage', orig)
      else Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'localStorage')
    }

    it('uses window.localStorage when present', () => {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: mockStorage() })
      const s = createSafeJSONStorage() // no injected backend → defaultBackend
      s.setItem('k', '"v"')
      expect(s.getItem('k')).toBe('"v"')
      restore()
    })

    it('returns null (no throw) when accessing window.localStorage throws', () => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('blocked')
        },
      })
      const s = createSafeJSONStorage() // no injected backend → defaultBackend hits the catch
      expect(s.getItem('k')).toBeNull()
      restore()
    })
  })
})

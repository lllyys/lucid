import { describe, it, expect, afterEach, vi } from 'vitest'
import { randomUuid } from './uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('randomUuid', () => {
  it('uses crypto.randomUUID when available and returns a v4 uuid', () => {
    expect(randomUuid()).toMatch(V4)
    expect(randomUuid()).not.toBe(randomUuid()) // unique
  })

  it('falls back to getRandomValues in an insecure context (no crypto.randomUUID) and still yields a valid v4 uuid', () => {
    // Simulate a non-secure context (http:// LAN): randomUUID absent, getRandomValues present.
    const realGRV = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    vi.stubGlobal('crypto', { getRandomValues: realGRV })
    const id = randomUuid()
    expect(id).toMatch(V4) // version (4) + variant (8/9/a/b) nibbles set correctly
    expect(randomUuid()).not.toBe(id)
  })
})

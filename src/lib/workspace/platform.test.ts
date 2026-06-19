import { describe, it, expect, afterEach, vi } from 'vitest'
import { isMacPlatform } from './platform'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isMacPlatform', () => {
  it('detects macOS from a Mac userAgent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
    expect(isMacPlatform()).toBe(true)
  })

  it('detects non-mac from a Windows userAgent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
    expect(isMacPlatform()).toBe(false)
  })

  it('falls back to false when navigator is unavailable', () => {
    vi.stubGlobal('navigator', undefined)
    expect(isMacPlatform()).toBe(false)
  })
})

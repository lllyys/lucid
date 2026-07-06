// WI-2 — the client-side proxy routing decision (#28). shouldProxy decides whether a custom provider's
// request is relayed through the same-origin server (only when token-free single-origin AND the
// provider's base URL is on the server's advertised allow-list); proxyTarget builds the POST URL + the
// x-lucid-proxy-upstream header. normalizeBaseUrl mirrors the server's trailing-slash rule so a
// normalization mismatch fails SAFE to the direct path.

import { describe, it, expect } from 'vitest'
import { shouldProxy, proxyTarget, normalizeBaseUrl } from './proxyRoute'

const ALLOWED = ['http://100.80.151.31:8000/v1', 'https://api.example.com/v1']

describe('normalizeBaseUrl', () => {
  it('strips trailing slashes on a valid http|https URL', () => {
    expect(normalizeBaseUrl('http://x:8000/v1/')).toBe('http://x:8000/v1')
    expect(normalizeBaseUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1')
  })
  it('returns null for empty / non-URL / non-http scheme', () => {
    expect(normalizeBaseUrl('')).toBeNull()
    expect(normalizeBaseUrl('   ')).toBeNull()
    expect(normalizeBaseUrl('not a url')).toBeNull()
    expect(normalizeBaseUrl('ftp://x/v1')).toBeNull()
  })
})

describe('shouldProxy', () => {
  it('is true for a token-free single-origin custom provider whose base URL is listed', () => {
    expect(
      shouldProxy({ singleOrigin: true, allowed: ALLOWED, vendor: 'custom', baseUrl: 'http://100.80.151.31:8000/v1' }),
    ).toBe(true)
  })

  it('matches after trailing-slash normalization', () => {
    expect(
      shouldProxy({ singleOrigin: true, allowed: ALLOWED, vendor: 'custom', baseUrl: 'http://100.80.151.31:8000/v1/' }),
    ).toBe(true)
  })

  it('is false when not single-origin (token-set or a different server)', () => {
    expect(
      shouldProxy({ singleOrigin: false, allowed: ALLOWED, vendor: 'custom', baseUrl: 'http://100.80.151.31:8000/v1' }),
    ).toBe(false)
  })

  it('is false for a built-in vendor even when single-origin + listed', () => {
    for (const vendor of ['anthropic', 'openai', 'gemini', 'ollama'] as const) {
      expect(shouldProxy({ singleOrigin: true, allowed: ALLOWED, vendor, baseUrl: 'http://100.80.151.31:8000/v1' })).toBe(
        false,
      )
    }
  })

  it('is false for a custom provider whose base URL is NOT on the allow-list', () => {
    expect(
      shouldProxy({ singleOrigin: true, allowed: ALLOWED, vendor: 'custom', baseUrl: 'http://unlisted.internal/v1' }),
    ).toBe(false)
  })

  it('is false against an empty allow-list (proxy disabled)', () => {
    expect(shouldProxy({ singleOrigin: true, allowed: [], vendor: 'custom', baseUrl: 'http://100.80.151.31:8000/v1' })).toBe(
      false,
    )
  })

  it('is false for an invalid base URL', () => {
    expect(shouldProxy({ singleOrigin: true, allowed: ALLOWED, vendor: 'custom', baseUrl: 'garbage' })).toBe(false)
  })
})

describe('proxyTarget', () => {
  it('builds the POST url + the normalized upstream header', () => {
    expect(proxyTarget('https://app.example.com', 'http://100.80.151.31:8000/v1/')).toEqual({
      url: 'https://app.example.com/proxy',
      upstreamHeader: 'http://100.80.151.31:8000/v1',
    })
  })

  it('falls back to the raw base URL when it does not normalize (defensive)', () => {
    expect(proxyTarget('https://app.example.com', 'garbage')).toEqual({
      url: 'https://app.example.com/proxy',
      upstreamHeader: 'garbage',
    })
  })
})

// WI-1 — the same-origin LLM proxy's SSRF allow-list logic (#28). Pure functions: parse the operator
// env var into a normalized allow-list, and match a client-supplied upstream against it. Tests target
// behavior: normalization (trailing slash, scheme), de-dup, drop-invalid, empty → [], exact match.

import { describe, expect, it } from 'vitest'
import { normalizeUpstream, parseAllowedUpstreams, isAllowedUpstream } from './proxy.js'

describe('normalizeUpstream', () => {
  it('strips trailing slashes off a valid base URL', () => {
    expect(normalizeUpstream('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1')
    expect(normalizeUpstream('https://api.example.com/v1//')).toBe('https://api.example.com/v1')
  })

  it('keeps a base URL with no trailing slash unchanged', () => {
    expect(normalizeUpstream('http://100.80.151.31:8000/v1')).toBe('http://100.80.151.31:8000/v1')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeUpstream('  http://x:8000/v1  ')).toBe('http://x:8000/v1')
  })

  it('returns null for an empty / whitespace-only value', () => {
    expect(normalizeUpstream('')).toBeNull()
    expect(normalizeUpstream('   ')).toBeNull()
  })

  it('returns null for a non-URL value', () => {
    expect(normalizeUpstream('not a url')).toBeNull()
  })

  it('returns null for a non-http(s) scheme (ftp, file, javascript)', () => {
    expect(normalizeUpstream('ftp://x/v1')).toBeNull()
    expect(normalizeUpstream('file:///etc/passwd')).toBeNull()
    expect(normalizeUpstream('javascript:alert(1)')).toBeNull()
  })
})

describe('parseAllowedUpstreams', () => {
  it('returns [] for undefined (env var unset → proxy disabled)', () => {
    expect(parseAllowedUpstreams(undefined)).toEqual([])
  })

  it('returns [] for an empty string', () => {
    expect(parseAllowedUpstreams('')).toEqual([])
  })

  it('splits a comma-separated list and normalizes each entry', () => {
    expect(
      parseAllowedUpstreams('http://100.80.151.31:8000/v1, http://localhost:11434/v1/'),
    ).toEqual(['http://100.80.151.31:8000/v1', 'http://localhost:11434/v1'])
  })

  it('drops blank and invalid entries (empty segments, non-http scheme, junk)', () => {
    expect(parseAllowedUpstreams('http://ok/v1, , ftp://bad/v1, not-a-url')).toEqual([
      'http://ok/v1',
    ])
  })

  it('de-duplicates entries that normalize to the same base URL', () => {
    expect(parseAllowedUpstreams('http://x/v1, http://x/v1/, http://x/v1//')).toEqual([
      'http://x/v1',
    ])
  })
})

describe('isAllowedUpstream', () => {
  const allowed = ['http://100.80.151.31:8000/v1', 'https://api.example.com/v1']

  it('matches an exact listed base URL', () => {
    expect(isAllowedUpstream('http://100.80.151.31:8000/v1', allowed)).toBe(true)
  })

  it('matches after trailing-slash normalization', () => {
    expect(isAllowedUpstream('http://100.80.151.31:8000/v1/', allowed)).toBe(true)
  })

  it('rejects a base URL not in the list', () => {
    expect(isAllowedUpstream('http://evil.internal/v1', allowed)).toBe(false)
  })

  it('rejects a path/host/scheme mismatch (not a prefix match)', () => {
    expect(isAllowedUpstream('http://100.80.151.31:8000/v2', allowed)).toBe(false)
    expect(isAllowedUpstream('http://100.80.151.31:9000/v1', allowed)).toBe(false)
    expect(isAllowedUpstream('https://100.80.151.31:8000/v1', allowed)).toBe(false)
  })

  it('rejects an invalid target (empty / non-URL)', () => {
    expect(isAllowedUpstream('', allowed)).toBe(false)
    expect(isAllowedUpstream('garbage', allowed)).toBe(false)
  })

  it('rejects everything against an empty allow-list', () => {
    expect(isAllowedUpstream('http://100.80.151.31:8000/v1', [])).toBe(false)
  })
})

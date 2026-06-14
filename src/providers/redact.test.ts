import { describe, it, expect } from 'vitest'
import { sanitizeDetail } from './redact'

describe('sanitizeDetail', () => {
  it('redacts sk- API keys', () => {
    expect(sanitizeDetail('boom with key sk-ant-api03-AbC123def456')).toBe('boom with key sk-[REDACTED]')
  })
  it('redacts UPPERCASE SK- keys (case-insensitive)', () => {
    expect(sanitizeDetail('SK-ANT-API03-ABCDEF123456')).toBe('sk-[REDACTED]')
  })
  it('redacts Bearer tokens including +, /, = padding', () => {
    expect(sanitizeDetail('sent Bearer ab+c/d=ef.gh-ij here')).toBe('sent Bearer [REDACTED] here')
  })
  it('fully redacts an Authorization: Bearer header (no token leaks)', () => {
    const out = sanitizeDetail('Authorization: Bearer ab+c/d=ef.gh-ij')
    expect(out).not.toContain('ab+c')
    expect(out).toContain('[REDACTED]')
  })
  it('redacts key: value and key=value secrets', () => {
    expect(sanitizeDetail('x-api-key: supersecret')).toBe('x-api-key: [REDACTED]')
    expect(sanitizeDetail('api_key=foo123')).toBe('api_key=[REDACTED]')
    expect(sanitizeDetail('token = zzz')).toBe('token = [REDACTED]')
  })
  it('redacts JSON-embedded secrets ("key":"value")', () => {
    const out = sanitizeDetail('{"api_key":"topsecret","note":"ok"}')
    expect(out).not.toContain('topsecret')
    expect(out).toContain('[REDACTED]')
  })
  it('redacts a secret in a query string', () => {
    expect(sanitizeDetail('GET https://api.x/v1?api-key=leaky failed')).not.toContain('leaky')
  })
  it('leaves a benign message untouched', () => {
    expect(sanitizeDetail('Failed to fetch')).toBe('Failed to fetch')
  })
  it('is idempotent', () => {
    const once = sanitizeDetail('key sk-ant-api03-SECRET99')
    expect(sanitizeDetail(once)).toBe(once)
  })
})

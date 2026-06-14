import { describe, it, expect } from 'vitest'
import {
  isAbortError,
  classifyStatus,
  parseRetryAfter,
  makeProviderError,
  errorFromStatus,
  toProviderError,
} from './errors'
import { ProviderException } from './types'

describe('isAbortError', () => {
  it('true for a DOMException named AbortError', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true)
  })
  it('true for an Error whose name is AbortError', () => {
    const e = new Error('x')
    e.name = 'AbortError'
    expect(isAbortError(e)).toBe(true)
  })
  it('false for TimeoutError (not an abort)', () => {
    expect(isAbortError(new DOMException('t', 'TimeoutError'))).toBe(false)
  })
  it('false for a generic error and non-objects', () => {
    expect(isAbortError(new Error('nope'))).toBe(false)
    expect(isAbortError({})).toBe(false) // object without a name
    expect(isAbortError('string')).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })
})

describe('classifyStatus', () => {
  it.each([
    [401, 'invalidKey'],
    [403, 'invalidKey'],
    [429, 'rateLimited'],
    [500, 'providerDown'],
    [503, 'providerDown'],
    [529, 'providerDown'], // Anthropic "overloaded" surfaces as 5xx
    [400, 'requestFailed'],
    [404, 'requestFailed'],
    [422, 'requestFailed'],
    [200, 'unknown'],
    [302, 'unknown'],
  ])('status %i -> %s', (status, kind) => {
    expect(classifyStatus(status)).toBe(kind)
  })
})

describe('parseRetryAfter', () => {
  it('integer seconds -> ms', () => {
    expect(parseRetryAfter('5')).toBe(5000)
  })
  it('decimal seconds -> ms', () => {
    expect(parseRetryAfter('1.5')).toBe(1500)
  })
  it('null / undefined / blank -> undefined', () => {
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter(undefined)).toBeUndefined()
    expect(parseRetryAfter('')).toBeUndefined()
    expect(parseRetryAfter('   ')).toBeUndefined()
  })
  it('negative / non-numeric -> undefined', () => {
    expect(parseRetryAfter('-5')).toBeUndefined()
    expect(parseRetryAfter('abc')).toBeUndefined()
  })
  it('huge seconds -> bounded to the max', () => {
    expect(parseRetryAfter('99999')).toBe(60000)
  })
  it('HTTP-date in the future -> positive bounded delta', () => {
    const now = 1_000_000
    const future = new Date(now + 10_000).toUTCString()
    const ms = parseRetryAfter(future, now)
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(60000)
  })
  it('HTTP-date in the past -> undefined', () => {
    const now = 2_000_000_000_000
    const past = new Date(now - 10_000).toUTCString()
    expect(parseRetryAfter(past, now)).toBeUndefined()
  })
  it('HTTP-date far in the future -> bounded to the max', () => {
    const now = 1_000_000
    const far = new Date(now + 10_000_000).toUTCString()
    expect(parseRetryAfter(far, now)).toBe(60000)
  })
})

describe('makeProviderError', () => {
  it('sets messageKey and retryable from the kind', () => {
    const e = makeProviderError('rateLimited')
    expect(e.kind).toBe('rateLimited')
    expect(e.messageKey).toBe('error.rateLimited')
    expect(e.retryable).toBe(true)
    expect(e.fallbackable).toBeUndefined()
  })
  it.each(['providerDown', 'timeout'] as const)('%s is retryable', (kind) => {
    expect(makeProviderError(kind).retryable).toBe(true)
  })
  it.each(['invalidKey', 'requestFailed', 'refusal', 'incomplete', 'validation', 'unknown', 'aborted'] as const)(
    '%s is not retryable',
    (kind) => {
      expect(makeProviderError(kind).retryable).toBe(false)
    },
  )
  it('passes through fallbackable / retryAfterMs / detail', () => {
    const e = makeProviderError('refusal', { fallbackable: true, detail: 'd' })
    expect(e.fallbackable).toBe(true)
    expect(e.detail).toBe('d')
    expect(makeProviderError('rateLimited', { retryAfterMs: 1234 }).retryAfterMs).toBe(1234)
  })
})

describe('errorFromStatus', () => {
  it('429 with Retry-After -> rateLimited + retryAfterMs', () => {
    const e = errorFromStatus(429, { retryAfter: '2' })
    expect(e.kind).toBe('rateLimited')
    expect(e.retryable).toBe(true)
    expect(e.retryAfterMs).toBe(2000)
  })
  it('429 without Retry-After -> no retryAfterMs', () => {
    expect(errorFromStatus(429).retryAfterMs).toBeUndefined()
  })
  it('401 -> invalidKey, not retryable', () => {
    const e = errorFromStatus(401)
    expect(e.kind).toBe('invalidKey')
    expect(e.retryable).toBe(false)
  })
  it('500 -> providerDown, retryable', () => {
    expect(errorFromStatus(500).kind).toBe('providerDown')
  })
  it('400 -> requestFailed', () => {
    expect(errorFromStatus(400).kind).toBe('requestFailed')
  })
  it('carries detail', () => {
    expect(errorFromStatus(500, { detail: 'boom' }).detail).toBe('boom')
  })
})

describe('toProviderError', () => {
  it('TimeoutError -> timeout (retryable)', () => {
    const e = toProviderError(new DOMException('t', 'TimeoutError'))
    expect(e.kind).toBe('timeout')
    expect(e.retryable).toBe(true)
  })
  it('AbortError -> aborted (not retryable)', () => {
    const e = toProviderError(new DOMException('a', 'AbortError'))
    expect(e.kind).toBe('aborted')
    expect(e.retryable).toBe(false)
  })
  it('TypeError (network failure) -> providerDown', () => {
    expect(toProviderError(new TypeError('Failed to fetch')).kind).toBe('providerDown')
  })
  it('ProviderException -> its providerError verbatim', () => {
    const pe = new ProviderException(makeProviderError('refusal', { fallbackable: true }))
    const e = toProviderError(pe)
    expect(e.kind).toBe('refusal')
    expect(e.fallbackable).toBe(true)
  })
  it('generic Error -> unknown with its message as detail', () => {
    const e = toProviderError(new Error('weird'))
    expect(e.kind).toBe('unknown')
    expect(e.detail).toBe('weird')
  })
  it('string -> unknown with the string as detail', () => {
    expect(toProviderError('boom').detail).toBe('boom')
  })
  it('opaque value / null -> unknown with no detail', () => {
    expect(toProviderError({ weird: true }).kind).toBe('unknown')
    expect(toProviderError({ weird: true }).detail).toBeUndefined()
    expect(toProviderError(null).kind).toBe('unknown')
    expect(toProviderError(null).detail).toBeUndefined()
  })
})

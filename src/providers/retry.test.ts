import { describe, it, expect, vi } from 'vitest'
import { withRetry, type RetryDeps } from './retry'
import { makeProviderError } from './errors'
import type { ErrorKind, ProviderOutcome } from './types'

function errOutcome(kind: ErrorKind, opts?: { retryAfterMs?: number }, text = ''): ProviderOutcome {
  return { status: 'error', text, error: makeProviderError(kind, opts) }
}

function deps(sleepImpl?: RetryDeps['sleep']): RetryDeps & { sleep: ReturnType<typeof vi.fn> } {
  return {
    sleep: vi.fn(sleepImpl ?? (async () => {})),
    random: () => 0.5,
  }
}

describe('withRetry', () => {
  it('retries a retryable zero-byte error, then returns the success', async () => {
    const attempt = vi
      .fn<() => Promise<ProviderOutcome>>()
      .mockResolvedValueOnce(errOutcome('providerDown'))
      .mockResolvedValueOnce({ status: 'done', text: 'ok' })
    const d = deps()
    const out = await withRetry(attempt, { maxAttempts: 3 }, d)
    expect(out).toEqual({ status: 'done', text: 'ok' })
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(d.sleep).toHaveBeenCalledTimes(1)
  })

  it('honors retryAfterMs for a rateLimited error', async () => {
    const attempt = vi
      .fn<() => Promise<ProviderOutcome>>()
      .mockResolvedValueOnce(errOutcome('rateLimited', { retryAfterMs: 1234 }))
      .mockResolvedValueOnce({ status: 'done', text: 'x' })
    const d = deps()
    await withRetry(attempt, { maxAttempts: 3 }, d)
    expect(d.sleep).toHaveBeenCalledWith(1234, undefined)
  })

  it('uses exponential backoff with jitter when there is no retryAfterMs', async () => {
    const attempt = vi
      .fn<() => Promise<ProviderOutcome>>()
      .mockResolvedValueOnce(errOutcome('providerDown'))
      .mockResolvedValueOnce(errOutcome('rateLimited')) // rateLimited but no retryAfterMs -> exp path
      .mockResolvedValueOnce({ status: 'done', text: 'x' })
    const d = deps()
    await withRetry(attempt, { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 10_000 }, d)
    // i=0: exp = 100*2^0 = 100, jitter = 0.5*100 = 50
    // i=1: exp = 100*2^1 = 200, jitter = 0.5*200 = 100
    expect(d.sleep).toHaveBeenNthCalledWith(1, 50, undefined)
    expect(d.sleep).toHaveBeenNthCalledWith(2, 100, undefined)
  })

  it('caps the exponential delay at maxDelayMs', async () => {
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue(errOutcome('providerDown'))
    const d = deps()
    await withRetry(attempt, { maxAttempts: 2, baseDelayMs: 100_000, maxDelayMs: 1000 }, d)
    // exp = min(100000, 1000) = 1000, jitter = 0.5*1000 = 500
    expect(d.sleep).toHaveBeenCalledWith(500, undefined)
  })

  it.each<[string, ProviderOutcome]>([
    ['cancelled', { status: 'cancelled', text: '' }],
    ['done', { status: 'done', text: 'x' }],
    ['invalidKey', errOutcome('invalidKey')],
    ['requestFailed', errOutcome('requestFailed')],
    ['refusal', errOutcome('refusal')],
    ['incomplete', errOutcome('incomplete')],
    ['validation', errOutcome('validation')],
    ['aborted', errOutcome('aborted')],
    ['unknown', errOutcome('unknown')],
  ])('does not retry %s', async (_label, outcome) => {
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue(outcome)
    const d = deps()
    const out = await withRetry(attempt, { maxAttempts: 3 }, d)
    expect(out).toEqual(outcome)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(d.sleep).not.toHaveBeenCalled()
  })

  it('does not retry a retryable error that already streamed bytes', async () => {
    const outcome = errOutcome('providerDown', undefined, 'partial')
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue(outcome)
    const d = deps()
    const out = await withRetry(attempt, { maxAttempts: 3 }, d)
    expect(out).toBe(outcome)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('returns the last error after exhausting maxAttempts', async () => {
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue(errOutcome('providerDown'))
    const d = deps()
    const out = await withRetry(attempt, { maxAttempts: 3 }, d)
    expect(out.status).toBe('error')
    expect(attempt).toHaveBeenCalledTimes(3)
    expect(d.sleep).toHaveBeenCalledTimes(2)
  })

  it('retries a timeout at most once', async () => {
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue(errOutcome('timeout'))
    const d = deps()
    const out = await withRetry(attempt, { maxAttempts: 5 }, d)
    expect(out.status).toBe('error')
    expect(attempt).toHaveBeenCalledTimes(2) // initial + one retry
    expect(d.sleep).toHaveBeenCalledTimes(1)
  })

  it('defaults maxAttempts to 3', async () => {
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue(errOutcome('providerDown'))
    const d = deps()
    await withRetry(attempt, {}, d)
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('returns cancelled without attempting when pre-aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue({ status: 'done', text: 'x' })
    const d = deps()
    const out = await withRetry(attempt, { signal: ac.signal }, d)
    expect(out).toEqual({ status: 'cancelled', text: '' })
    expect(attempt).not.toHaveBeenCalled()
  })

  it('returns cancelled if the signal aborts during the attempt (before sleep)', async () => {
    const ac = new AbortController()
    const attempt = vi.fn<() => Promise<ProviderOutcome>>(async () => {
      ac.abort()
      return errOutcome('providerDown')
    })
    const d = deps()
    const out = await withRetry(attempt, { maxAttempts: 3, signal: ac.signal }, d)
    expect(out).toEqual({ status: 'cancelled', text: '' })
    expect(d.sleep).not.toHaveBeenCalled()
  })

  it('returns cancelled if the signal aborts during backoff', async () => {
    const ac = new AbortController()
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue(errOutcome('providerDown'))
    const d = deps(async () => {
      ac.abort()
    })
    const out = await withRetry(attempt, { maxAttempts: 3, signal: ac.signal }, d)
    expect(out).toEqual({ status: 'cancelled', text: '' })
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(d.sleep).toHaveBeenCalledTimes(1)
  })

  it('does not retry a self-contradictory error (non-transient kind flagged retryable)', async () => {
    // A directly-constructed ProviderError that lies about retryability.
    const outcome: ProviderOutcome = {
      status: 'error',
      text: '',
      error: { kind: 'invalidKey', messageKey: 'error.invalidKey', retryable: true },
    }
    const attempt = vi.fn<() => Promise<ProviderOutcome>>().mockResolvedValue(outcome)
    const d = deps()
    const out = await withRetry(attempt, { maxAttempts: 3 }, d)
    expect(out).toBe(outcome)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(d.sleep).not.toHaveBeenCalled()
  })

  it('honors a Retry-After longer than the exponential cap (maxDelayMs)', async () => {
    const attempt = vi
      .fn<() => Promise<ProviderOutcome>>()
      .mockResolvedValueOnce(errOutcome('rateLimited', { retryAfterMs: 45_000 }))
      .mockResolvedValueOnce({ status: 'done', text: 'x' })
    const d = deps()
    await withRetry(attempt, { maxAttempts: 3, maxDelayMs: 30_000 }, d)
    // Retry-After (45s) must not be shortened to the 30s exp cap; bounded only by 60s.
    expect(d.sleep).toHaveBeenCalledWith(45_000, undefined)
  })

  it.each<[string, number]>([
    ['negative', -100],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('clamps an invalid retryAfterMs (%s) to 0', async (_label, bad) => {
    const attempt = vi
      .fn<() => Promise<ProviderOutcome>>()
      .mockResolvedValueOnce(errOutcome('rateLimited', { retryAfterMs: bad }))
      .mockResolvedValueOnce({ status: 'done', text: 'x' })
    const d = deps()
    await withRetry(attempt, { maxAttempts: 3 }, d)
    expect(d.sleep).toHaveBeenCalledWith(0, undefined)
  })
})

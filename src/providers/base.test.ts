import { describe, it, expect, vi } from 'vitest'
import { collectStream, withFallback, defineProvider, type VendorStreamFn } from './base'
import { ProviderHttpError } from './stream'
import { makeProviderError } from './errors'
import { ProviderException, type ProviderOutcome, type StreamChunk } from './types'
import type { RetryDeps } from './retry'

async function* fromTexts(...texts: string[]): AsyncGenerator<StreamChunk> {
  for (const t of texts) yield { text: t }
}

/** A stream that rejects on first read — simulates a vendor stream that throws immediately. */
function throwingStream(err: unknown): AsyncIterable<StreamChunk> {
  return { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(err) }) }
}

const fakeRetry: RetryDeps = { sleep: async () => {}, random: () => 0.5 }

describe('collectStream', () => {
  it('accumulates chunks into a done outcome', async () => {
    expect(await collectStream(fromTexts('Hola', ' mundo'))).toEqual({ status: 'done', text: 'Hola mundo' })
  })

  it('returns cancelled immediately (stream untouched) for a pre-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    const started = vi.fn()
    async function* s(): AsyncGenerator<StreamChunk> {
      started()
      yield { text: 'x' }
    }
    expect(await collectStream(s(), { signal: ac.signal })).toEqual({ status: 'cancelled', text: '' })
    expect(started).not.toHaveBeenCalled()
  })

  it('returns cancelled if the signal aborts exactly as the stream ends', async () => {
    const ac = new AbortController()
    async function* s(): AsyncGenerator<StreamChunk> {
      yield { text: 'a' }
      ac.abort() // aborts on the final next(), after the last chunk
    }
    expect(await collectStream(s(), { signal: ac.signal })).toEqual({ status: 'cancelled', text: 'a' })
  })

  it('returns cancelled (with partial text) when the signal aborts mid-stream', async () => {
    const ac = new AbortController()
    async function* s(): AsyncGenerator<StreamChunk> {
      yield { text: 'a' }
      ac.abort()
      yield { text: 'b' }
    }
    expect(await collectStream(s(), { signal: ac.signal })).toEqual({ status: 'cancelled', text: 'a' })
  })

  it('returns cancelled when the stream throws an AbortError', async () => {
    async function* s(): AsyncGenerator<StreamChunk> {
      yield { text: 'x' }
      throw new DOMException('aborted', 'AbortError')
    }
    expect(await collectStream(s())).toEqual({ status: 'cancelled', text: 'x' })
  })

  it('returns cancelled when the signal is aborted and the stream throws', async () => {
    const ac = new AbortController()
    ac.abort()
    expect(await collectStream(throwingStream(new Error('boom')), { signal: ac.signal })).toEqual({
      status: 'cancelled',
      text: '',
    })
  })

  it('maps a ProviderHttpError via errorFromStatus', async () => {
    const out = await collectStream(throwingStream(new ProviderHttpError(429, '2', 'rate limited')))
    expect(out.status).toBe('error')
    if (out.status === 'error') {
      expect(out.error.kind).toBe('rateLimited')
      expect(out.error.retryAfterMs).toBe(2000)
    }
  })

  it('maps a thrown ProviderException to its error (incomplete keeps partial text)', async () => {
    async function* s(): AsyncGenerator<StreamChunk> {
      yield { text: 'half' }
      throw new ProviderException(makeProviderError('incomplete'))
    }
    const out = await collectStream(s())
    expect(out).toMatchObject({ status: 'error', text: 'half' })
    if (out.status === 'error') expect(out.error.kind).toBe('incomplete')
  })

  it('maps a generic thrown error to unknown', async () => {
    const out = await collectStream(throwingStream(new Error('weird')))
    expect(out.status).toBe('error')
    if (out.status === 'error') expect(out.error.kind).toBe('unknown')
  })

  it('sanitizes a secret in the error detail at the outcome boundary', async () => {
    const out = await collectStream(throwingStream(new Error('boom with sk-ant-api03-SECRET99 leaked')))
    if (out.status === 'error') {
      expect(out.error.detail).not.toContain('SECRET99')
      expect(out.error.detail).toContain('[REDACTED]')
    }
  })
})

describe('withFallback', () => {
  const fbErr = (text = ''): ProviderOutcome => ({
    status: 'error',
    text,
    error: makeProviderError('refusal', { fallbackable: true }),
  })

  it('returns the first success without advancing', async () => {
    const run = vi.fn(async () => ({ status: 'done', text: 'ok' }) as ProviderOutcome)
    expect(await withFallback(['a', 'b'], run)).toEqual({ status: 'done', text: 'ok' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('advances on a zero-output fallbackable error, then returns the next success', async () => {
    const run = vi.fn(async (m: string) => (m === 'a' ? fbErr() : ({ status: 'done', text: 'b-ok' } as ProviderOutcome)))
    const out = await withFallback(['a', 'b'], run)
    expect(out).toEqual({ status: 'done', text: 'b-ok' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does NOT advance when the fallbackable error already streamed bytes', async () => {
    const run = vi.fn(async () => fbErr('partial'))
    const out = await withFallback(['a', 'b'], run)
    expect(out).toEqual(fbErr('partial'))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does NOT advance on a non-fallbackable error', async () => {
    const err: ProviderOutcome = { status: 'error', text: '', error: makeProviderError('invalidKey') }
    const run = vi.fn(async () => err)
    expect(await withFallback(['a', 'b'], run)).toEqual(err)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does NOT advance on a cancelled outcome', async () => {
    const run = vi.fn(async () => ({ status: 'cancelled', text: '' }) as ProviderOutcome)
    expect((await withFallback(['a', 'b'], run)).status).toBe('cancelled')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('returns the last error after exhausting the chain', async () => {
    const run = vi.fn(async () => fbErr())
    const out = await withFallback(['a', 'b'], run)
    expect(out.status).toBe('error')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('returns an unknown error for an empty chain', async () => {
    const out = await withFallback([], vi.fn())
    expect(out).toMatchObject({ status: 'error' })
    if (out.status === 'error') expect(out.error.kind).toBe('unknown')
  })
})

describe('defineProvider', () => {
  const make = (streamFn: VendorStreamFn) =>
    defineProvider({ vendor: 'anthropic', model: 'claude-fable-5', streamFn, retry: fakeRetry })

  it('translate collects the stream into a done outcome', async () => {
    const p = make(() => fromTexts('Hola', ' mundo'))
    expect(await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' })).toEqual({
      status: 'done',
      text: 'Hola mundo',
    })
  })

  it('polish collects the stream into a done outcome', async () => {
    const p = make(() => fromTexts('clearer'))
    expect(await p.polish({ kind: 'polish', text: 'x', goal: 'clarity' })).toEqual({ status: 'done', text: 'clearer' })
  })

  it('stream() is single-attempt and yields raw chunks', async () => {
    const p = make(() => fromTexts('a', 'b'))
    const got: string[] = []
    for await (const c of p.stream({ kind: 'polish', text: 'x', goal: 'tone' })) got.push(c.text)
    expect(got).toEqual(['a', 'b'])
    expect(p.vendor).toBe('anthropic')
    expect(p.model).toBe('claude-fable-5')
  })

  it('retries a transient zero-byte failure on the same model', async () => {
    let n = 0
    const streamFn: VendorStreamFn = () => {
      const attempt = n++
      return (async function* () {
        if (attempt === 0) throw new ProviderException(makeProviderError('providerDown'))
        yield { text: 'recovered' }
      })()
    }
    const p = make(streamFn)
    expect(await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'fr' })).toEqual({
      status: 'done',
      text: 'recovered',
    })
    expect(n).toBe(2)
  })

  it('falls back to the next model on a zero-output fallbackable refusal', async () => {
    const seen: string[] = []
    const streamFn: VendorStreamFn = (_req, opts) => {
      seen.push(opts.model ?? '?')
      return (async function* () {
        if (opts.model === 'claude-fable-5') throw new ProviderException(makeProviderError('refusal', { fallbackable: true }))
        yield { text: 'fallback-ok' }
      })()
    }
    const p = make(streamFn)
    const out = await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'de' })
    expect(out).toEqual({ status: 'done', text: 'fallback-ok' })
    expect(seen.slice(0, 2)).toEqual(['claude-fable-5', 'claude-opus-4-8'])
  })

  it('turns a synchronous throw from the vendor stream into an error outcome (never rejects)', async () => {
    const streamFn: VendorStreamFn = () => {
      throw new ProviderException(makeProviderError('requestFailed'))
    }
    const p = make(streamFn)
    const out = await p.translate({ kind: 'translate', text: 'x', targetLang: 'es' })
    expect(out.status).toBe('error')
    if (out.status === 'error') expect(out.error.kind).toBe('requestFailed')
  })

  it('honors an explicit per-call model override', async () => {
    const seen: string[] = []
    const streamFn: VendorStreamFn = (_req, opts) => {
      seen.push(opts.model ?? '?')
      return fromTexts('ok')
    }
    const p = make(streamFn)
    await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' }, { model: 'claude-opus-4-8' })
    expect(seen[0]).toBe('claude-opus-4-8')
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { createProvider, realSleep } from './index'
import { ProviderException, type Vendor } from './types'
import { streamResponse } from '@/test/providerTestUtils'
import type { RetryDeps } from './retry'

const fakeDeps: RetryDeps = { sleep: async () => {}, random: () => 0.5 }
const sse = (...e: object[]) => e.map((x) => `data: ${JSON.stringify(x)}\n\n`)

describe('createProvider', () => {
  it('builds an Anthropic provider with the resolved default model', () => {
    const p = createProvider('anthropic', { apiKey: 'sk-test' })
    expect(p.vendor).toBe('anthropic')
    expect(p.model).toBe('claude-fable-5')
  })
  it('resolves an explicitly requested model', () => {
    expect(createProvider('anthropic', { apiKey: 'sk-test', model: 'claude-opus-4-8' }).model).toBe('claude-opus-4-8')
  })
  it('throws invalidKey when no API key is supplied (config defaults to {})', () => {
    try {
      createProvider('anthropic')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderException)
      expect((e as ProviderException).providerError.kind).toBe('invalidKey')
    }
  })
  it.each(['openai', 'gemini', 'ollama'] as Vendor[])('throws for the unimplemented vendor %s', (vendor) => {
    try {
      createProvider(vendor, { apiKey: 'sk-test' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderException)
      expect((e as ProviderException).providerError.kind).toBe('requestFailed')
    }
  })
  it('builds a custom provider with a user-supplied baseUrl + model (OpenAI-compatible)', () => {
    const p = createProvider('custom', { apiKey: 'sk-test', baseUrl: 'https://api.example.com/v1', model: 'my-model' })
    expect(p.vendor).toBe('custom')
    expect(p.model).toBe('my-model')
  })
  it('a custom provider streams through the OpenAI-compatible engine (mocked fetch)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse({ choices: [{ delta: { content: 'hi' } }] }).concat('data: [DONE]\n\n'))),
    )
    const p = createProvider(
      'custom',
      { apiKey: 'sk-test', baseUrl: 'https://api.example.com/v1', model: 'm', fetch: fetchMock as unknown as typeof fetch },
      fakeDeps,
    )
    expect(await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' })).toEqual({ status: 'done', text: 'hi' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://api.example.com/v1/chat/completions')
  })
  it('a custom provider without a baseUrl throws requestFailed', () => {
    try {
      createProvider('custom', { apiKey: 'sk-test', model: 'm' })
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as ProviderException).providerError.kind).toBe('requestFailed')
    }
  })
  it('a custom provider without a model throws requestFailed', () => {
    try {
      createProvider('custom', { apiKey: 'sk-test', baseUrl: 'https://x/v1' })
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as ProviderException).providerError.kind).toBe('requestFailed')
    }
  })
  it('translate() works end-to-end through retry/fallback wiring (mocked fetch)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse(
          sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hola' } }, { type: 'message_stop' }),
        ),
      ),
    )
    const p = createProvider('anthropic', { apiKey: 'sk-test', fetch: fetchMock as unknown as typeof fetch }, fakeDeps)
    expect(await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' })).toEqual({ status: 'done', text: 'Hola' })
  })
})

describe('realSleep', () => {
  afterEach(() => vi.useRealTimers())

  it('resolves immediately for an already-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(realSleep(10_000, ac.signal)).resolves.toBeUndefined()
  })
  it('resolves after the delay elapses', async () => {
    vi.useFakeTimers()
    let done = false
    const p = realSleep(50).then(() => {
      done = true
    })
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    await p
    expect(done).toBe(true)
  })
  it('resolves early when the signal aborts during the wait', async () => {
    const ac = new AbortController()
    const p = realSleep(10_000, ac.signal)
    ac.abort()
    await expect(p).resolves.toBeUndefined()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { createProvider } from './index'
import { ProviderException, type Vendor } from './types'
import { streamResponse } from '@/test/providerTestUtils'
import * as registry from './modelRegistry'
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
  it('builds an OpenAI provider (resolved default model) and streams via the OpenAI-compatible engine', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse({ choices: [{ delta: { content: 'hi' } }] }).concat('data: [DONE]\n\n'))),
    )
    const p = createProvider('openai', { apiKey: 'sk-test', fetch: fetchMock as unknown as typeof fetch }, fakeDeps)
    expect(p.vendor).toBe('openai')
    expect(p.model).toBe('gpt-5.5')
    expect(await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' })).toEqual({ status: 'done', text: 'hi' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('builds an Ollama provider WITHOUT a key (local, no-key) and points at localhost', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse({ choices: [{ delta: { content: 'hola' } }] }).concat('data: [DONE]\n\n'))),
    )
    const p = createProvider('ollama', { fetch: fetchMock as unknown as typeof fetch }, fakeDeps) // no apiKey
    expect(p.vendor).toBe('ollama')
    expect(p.model).toBe('llama3.2')
    expect(await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' })).toEqual({ status: 'done', text: 'hola' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('builds a Gemini provider and streams via the Gemini engine (generateContent)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hola' }] }, finishReason: 'STOP' }] })}\n\n`,
        ]),
      ),
    )
    const p = createProvider('gemini', { apiKey: 'AIzaTEST', fetch: fetchMock as unknown as typeof fetch }, fakeDeps)
    expect(p.vendor).toBe('gemini')
    expect(p.model).toBe('gemini-3.5-flash')
    expect(await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' })).toEqual({ status: 'done', text: 'Hola' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain(':streamGenerateContent?alt=sse')
  })

  it.each(['openai', 'gemini'] as Vendor[])('still throws invalidKey for the keyed vendor %s with no key', (vendor) => {
    try {
      createProvider(vendor)
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as ProviderException).providerError.kind).toBe('invalidKey')
    }
  })

  it('throws requestFailed for a vendor the registry reports unimplemented (defense-in-depth)', () => {
    const spy = vi.spyOn(registry, 'isVendorImplemented').mockReturnValue(false)
    try {
      createProvider('openai', { apiKey: 'sk-test' })
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as ProviderException).providerError.kind).toBe('requestFailed')
    } finally {
      spy.mockRestore()
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
  it('builds a custom provider WITHOUT a key (keyless self-hosted) — key is optional', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse({ choices: [{ delta: { content: 'ok' } }] }).concat('data: [DONE]\n\n'))),
    )
    const p = createProvider(
      'custom',
      { baseUrl: 'https://my-host/v1', model: 'm', fetch: fetchMock as unknown as typeof fetch }, // no apiKey
      fakeDeps,
    )
    expect(p.vendor).toBe('custom')
    expect(await p.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' })).toEqual({ status: 'done', text: 'ok' })
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
// realSleep moved to src/lib/async/backoff.ts (#9 WI-0); its tests live in backoff.test.ts.

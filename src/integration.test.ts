import { describe, it, expect, vi } from 'vitest'
import { createProvider } from '@/providers'
import { useProviderStore } from '@/stores/providerStore'
import { streamResponse } from '@/test/providerTestUtils'
import i18n from '@/i18n'
import type { RetryDeps } from '@/providers/retry'

const fakeDeps: RetryDeps = { sleep: async () => {}, random: () => 0.5 }
const sse = (...e: object[]) => e.map((x) => `data: ${JSON.stringify(x)}\n\n`)

// Final WI-7 integration: every layer (store config → factory → prompts → transport →
// SSE parsing → outcome) composes end-to-end against a mocked provider endpoint.
describe('end-to-end provider stack', () => {
  it('configures via the store, builds a provider, and streams a translation to completion', async () => {
    useProviderStore.getState().reset()
    useProviderStore.getState().setApiKey('sk-test')
    expect(useProviderStore.getState().isReady()).toBe(true)

    const { vendor, model, apiKey } = useProviderStore.getState()
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse(
          sse(
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hola' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' mundo' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
            { type: 'message_stop' },
          ),
        ),
      ),
    )
    const provider = createProvider(vendor, { apiKey, model, fetch: fetchMock as unknown as typeof fetch }, fakeDeps)
    const outcome = await provider.translate({ kind: 'translate', text: 'Hello world', targetLang: 'es' })
    expect(outcome).toEqual({ status: 'done', text: 'Hola mundo' })

    // The outbound request reflects the config + prompt — a silent break here must fail the test.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/v1/messages')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('claude-fable-5')
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello world' }])
    expect(body.system).toContain('Spanish') // resolved target language in the prompt
  })

  it('surfaces a mapped, localized error (rate limit) without leaking the raw payload', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(['raw vendor rate-limit body'], { status: 429 })))
    const provider = createProvider(
      'anthropic',
      { apiKey: 'sk-test', fetch: fetchMock as unknown as typeof fetch },
      fakeDeps,
    )
    const outcome = await provider.translate({ kind: 'translate', text: 'Hi', targetLang: 'es' })
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') {
      expect(outcome.error.kind).toBe('rateLimited')
      expect(outcome.error.messageKey).toBe('error.rateLimited')
      // The user-facing (localized) message resolves and does NOT contain the raw vendor body.
      const message = i18n.t(outcome.error.messageKey)
      expect(message).not.toBe(outcome.error.messageKey) // resolved, not the raw key
      expect(message.toLowerCase()).toContain('rate limit')
      expect(message).not.toContain('raw vendor rate-limit body')
    }
  })
})

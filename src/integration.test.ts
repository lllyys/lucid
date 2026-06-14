import { describe, it, expect, vi } from 'vitest'
import { createProvider } from '@/providers'
import { useProviderStore } from '@/stores/providerStore'
import { streamResponse } from '@/test/providerTestUtils'
import type { RetryDeps } from '@/providers/retry'

const fakeDeps: RetryDeps = { sleep: async () => {}, random: () => 0.5 }
const sse = (...e: object[]) => e.map((x) => `data: ${JSON.stringify(x)}\n\n`)

// Final WI-7 integration: every layer (store config → factory → prompts → transport →
// SSE parsing → outcome) composes end-to-end against a mocked provider endpoint.
describe('end-to-end provider stack', () => {
  it('configures via the store, builds a provider, and streams a translation to completion', () => {
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
    return expect(
      provider.translate({ kind: 'translate', text: 'Hello world', targetLang: 'es' }),
    ).resolves.toEqual({ status: 'done', text: 'Hola mundo' })
  })

  it('surfaces a localized, mapped error (rate limit) — never a raw payload', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(['rate limited'], { status: 429 })))
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
    }
  })
})

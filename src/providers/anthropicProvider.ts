// Purpose: the Anthropic Messages API streaming adapter (rule 65 §1/§3). It maps
// our LLMRequest to the Messages request, streams via fetchStream + readSSE, and
// translates Anthropic SSE events into StreamChunks / a thrown ProviderException.
// Model IDs/limits come from the registry; the request shape + headers follow the
// claude-api skill (Fable 5 thinking is always-on, so the `thinking` param is
// omitted; sampling params are not sent). Vendor shapes never leak past here.

import type { LLMRequest, StreamChunk, StreamOptions } from './types'
import { ProviderException } from './types'
import { makeProviderError } from './errors'
import { fetchStream, readSSE } from './stream'
import { capabilityOf } from './modelRegistry'
import { buildPrompt } from '@/lib/prompts'
import type { VendorStreamFn } from './base'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const FALLBACK_MAX_TOKENS = 8192

export interface AnthropicDeps {
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

// Minimal shape of the Anthropic SSE event JSON we care about (no `any`).
interface SSEEvent {
  type?: string
  delta?: { type?: string; text?: string; stop_reason?: string }
  error?: { type?: string }
}

export function anthropicStream(deps: AnthropicDeps): VendorStreamFn {
  return async function* (request: LLMRequest, options: StreamOptions): AsyncIterable<StreamChunk> {
    const model = options.model ?? 'claude-fable-5'
    const { system, user } = buildPrompt(request)
    const maxTokens =
      options.maxOutputTokens ?? capabilityOf('anthropic', model)?.maxOutputTokens ?? FALLBACK_MAX_TOKENS
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      stream: true,
    })
    const headers = {
      'content-type': 'application/json',
      'x-api-key': deps.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    }
    const bytes = fetchStream(
      deps.baseUrl ?? ANTHROPIC_URL,
      { method: 'POST', headers, body },
      { signal: options.signal, timeoutMs: options.timeoutMs, fetch: deps.fetch },
    )

    let sawStop = false
    let stopReason: string | undefined
    let produced = false

    for await (const payload of readSSE(bytes)) {
      let event: SSEEvent
      try {
        event = JSON.parse(payload) as SSEEvent
      } catch {
        throw new ProviderException(makeProviderError('requestFailed', { detail: 'malformed SSE JSON' }))
      }
      switch (event.type) {
        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
            produced = true
            yield { text: event.delta.text }
          }
          break
        case 'message_delta':
          if (event.delta?.stop_reason) stopReason = event.delta.stop_reason
          break
        case 'message_stop':
          sawStop = true
          break
        case 'error':
          throw new ProviderException(makeProviderError('providerDown', { detail: event.error?.type ?? 'stream error' }))
        default:
          break // message_start / content_block_start|stop / ping / thinking deltas — ignored
      }
    }

    // refusal (HTTP 200) — fallbackable only if nothing was produced (rule 65 §2)
    if (stopReason === 'refusal') {
      throw new ProviderException(makeProviderError('refusal', { fallbackable: !produced }))
    }
    if (stopReason === 'max_tokens') {
      throw new ProviderException(makeProviderError('incomplete', { detail: 'max_tokens reached' }))
    }
    if (!sawStop) {
      throw new ProviderException(makeProviderError('incomplete', { detail: 'stream ended before message_stop' }))
    }
  }
}

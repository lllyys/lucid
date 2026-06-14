// Purpose: the Anthropic Messages API streaming adapter (rule 65 §1/§3). It maps
// our LLMRequest to the Messages request, streams via fetchStream + readSSE, and
// translates Anthropic SSE events into StreamChunks / a thrown ProviderException.
// Model IDs/limits come from the registry; the request shape + headers follow the
// claude-api skill (Fable 5 thinking is always-on, so the `thinking` param is
// omitted; sampling params are not sent). Vendor shapes never leak past here.

import type { ErrorKind, LLMRequest, StreamChunk, StreamOptions } from './types'
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

// Map an Anthropic streamed error.type to our ErrorKind so a non-transient error
// (auth, bad request) is not retried as a transient providerDown (rule 65 §4).
function streamErrorKind(type: string | undefined): ErrorKind {
  switch (type) {
    case 'authentication_error':
    case 'permission_error':
      return 'invalidKey'
    case 'invalid_request_error':
    case 'not_found_error':
    case 'billing_error':
    case 'request_too_large':
      return 'requestFailed'
    case 'rate_limit_error':
      return 'rateLimited'
    case 'timeout_error':
      return 'timeout'
    default:
      return 'providerDown' // overloaded_error, api_error, and unknown server errors
  }
}

// Stop reasons that mean the output was truncated, not completed.
function isTruncationStop(stopReason: string | undefined): boolean {
  return stopReason === 'max_tokens' || stopReason === 'model_context_window_exceeded'
}

// Clamp a max-output request to a positive integer within the model's capability.
function sizeMaxTokens(model: string, requested: number | undefined): number {
  const capMax = capabilityOf('anthropic', model)?.maxOutputTokens ?? FALLBACK_MAX_TOKENS
  const value = requested ?? capMax
  const sized = Number.isFinite(value) ? Math.floor(value) : capMax
  return Math.max(1, Math.min(sized, capMax))
}

export function anthropicStream(deps: AnthropicDeps): VendorStreamFn {
  return async function* (request: LLMRequest, options: StreamOptions): AsyncIterable<StreamChunk> {
    const model = options.model ?? 'claude-fable-5'
    const { system, user } = buildPrompt(request)
    const maxTokens = sizeMaxTokens(model, options.maxOutputTokens)
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
      let parsed: unknown
      try {
        parsed = JSON.parse(payload)
      } catch {
        throw new ProviderException(makeProviderError('requestFailed', { detail: 'malformed SSE JSON' }))
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ProviderException(makeProviderError('requestFailed', { detail: 'non-object SSE payload' }))
      }
      const event = parsed as SSEEvent
      switch (event.type) {
        case 'content_block_delta':
          // Only non-empty answer text counts as output; empty/thinking deltas don't.
          if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string' && event.delta.text.length > 0) {
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
          throw new ProviderException(
            makeProviderError(streamErrorKind(event.error?.type), { detail: event.error?.type ?? 'stream error' }),
          )
        default:
          break // message_start / content_block_start|stop / ping / thinking deltas — ignored
      }
    }

    // refusal (HTTP 200) — fallbackable only if nothing was produced (rule 65 §2)
    if (stopReason === 'refusal') {
      throw new ProviderException(makeProviderError('refusal', { fallbackable: !produced }))
    }
    if (isTruncationStop(stopReason)) {
      throw new ProviderException(makeProviderError('incomplete', { detail: stopReason }))
    }
    if (!sawStop) {
      throw new ProviderException(makeProviderError('incomplete', { detail: 'stream ended before message_stop' }))
    }
  }
}

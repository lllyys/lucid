// Purpose: a generic OpenAI-compatible chat/completions streaming adapter (feature #7 — #31). One
// VendorStreamFn, parameterized by base URL + model, that serves the user-defined `custom` provider
// AND (feature #5) any vendor exposing `/v1/chat/completions` (OpenAI, Ollama). Mirrors
// anthropicProvider: maps LLMRequest via buildPrompt → an OpenAI chat body, streams via
// fetchStream + readSSE, and translates the SSE into StreamChunks / a thrown ProviderException.
// Vendor shapes never leak past here (rule 65 §1). Key in the Bearer header, never logged (§5).

import type { LLMRequest, StreamChunk, StreamOptions } from './types'
import { ProviderException } from './types'
import { makeProviderError, errorFromStatus } from './errors'
import { fetchStream, readSSE } from './stream'
import { buildPrompt } from '@/lib/prompts'
import type { VendorStreamFn } from './base'

export interface OpenAICompatibleDeps {
  apiKey: string
  /** API root, e.g. https://api.openai.com/v1 (the factory guarantees it is non-empty). */
  baseUrl: string
  fetch?: typeof fetch
}

// Minimal shape of the OpenAI chat/completions SSE payload we read (no `any`).
interface OpenAISSE {
  choices?: Array<{ delta?: { content?: unknown }; finish_reason?: string | null }>
  error?: { message?: string; type?: string; code?: number | string }
}

const DONE = '[DONE]'

/** `${baseUrl}/chat/completions` with any trailing slash(es) on the root normalized away. */
function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
}

export function openaiCompatibleStream(deps: OpenAICompatibleDeps): VendorStreamFn {
  return async function* (request: LLMRequest, options: StreamOptions): AsyncIterable<StreamChunk> {
    const model = options.model ?? ''
    const { system, user } = buildPrompt(request)
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: true,
      ...(options.maxOutputTokens ? { max_tokens: Math.max(1, Math.floor(options.maxOutputTokens)) } : {}),
    })
    // Omit Authorization entirely for a keyless endpoint (custom self-hosted) — an empty `Bearer `
    // header is rejected by some servers. A present key (named vendors, ollama placeholder, keyed
    // custom) is sent as a Bearer token, never logged (rule 65 §5).
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (deps.apiKey) headers.authorization = `Bearer ${deps.apiKey}`
    const bytes = fetchStream(
      chatCompletionsUrl(deps.baseUrl),
      { method: 'POST', headers, body },
      { signal: options.signal, timeoutMs: options.timeoutMs, fetch: deps.fetch },
    )

    let produced = false
    let finishReason: string | null | undefined
    let sawDone = false

    for await (const payload of readSSE(bytes)) {
      if (payload === DONE) {
        sawDone = true
        break
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(payload)
      } catch {
        throw new ProviderException(makeProviderError('requestFailed', { detail: 'malformed SSE JSON' }))
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ProviderException(makeProviderError('requestFailed', { detail: 'non-object SSE payload' }))
      }
      const event = parsed as OpenAISSE
      // An OpenAI error object can arrive on an HTTP 200 stream — map it instead of crashing on `choices`.
      if (event.error) {
        const code = typeof event.error.code === 'number' ? event.error.code : undefined
        throw new ProviderException(
          code !== undefined
            ? errorFromStatus(code)
            : makeProviderError('providerDown', { detail: event.error.type ?? 'stream error' }),
        )
      }
      const choice = event.choices?.[0]
      if (choice) {
        const content = choice.delta?.content
        if (typeof content === 'string' && content.length > 0) {
          produced = true
          yield { text: content }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason
      }
    }

    if (finishReason === 'content_filter') {
      throw new ProviderException(makeProviderError('refusal', { fallbackable: !produced }))
    }
    if (finishReason === 'length') {
      throw new ProviderException(makeProviderError('incomplete', { detail: 'length' }))
    }
    // A clean finish needs either an explicit [DONE] or a terminal finish_reason; otherwise the
    // stream was cut off before completing.
    if (!sawDone && finishReason == null) {
      throw new ProviderException(makeProviderError('incomplete', { detail: 'stream ended before [DONE]' }))
    }
  }
}

// Purpose: the Google Gemini generateContent streaming adapter (feature #5 — #27). Gemini is NOT
// OpenAI-compatible, so it gets its own VendorStreamFn (parallel to anthropicProvider): it maps our
// LLMRequest via buildPrompt → a generateContent request, streams via fetchStream + readSSE over the
// `:streamGenerateContent?alt=sse` endpoint, and translates Gemini SSE into StreamChunks / a thrown
// ProviderException. Auth is the `x-goog-api-key` header (never Authorization too — that's a 400; the
// key is never logged, rule 65 §5). Model IDs come from the registry (no literal here, rule 65 §2).
// Vendor shapes never leak past this file (rule 65 §1).

import type { LLMRequest, StreamChunk, StreamOptions } from './types'
import { ProviderException } from './types'
import { makeProviderError, errorFromStatus } from './errors'
import { fetchStream, readSSE } from './stream'
import { buildPrompt } from '@/lib/prompts'
import type { VendorStreamFn } from './base'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'

export interface GeminiDeps {
  apiKey: string
  /** Override the API root (default https://generativelanguage.googleapis.com) — proxies/self-host. */
  baseUrl?: string
  fetch?: typeof fetch
}

// Minimal shape of the Gemini streamGenerateContent SSE payload we read (no `any`).
interface GeminiSSE {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  error?: { code?: number | string; status?: string; message?: string }
}

// finishReason values that mean the model declined (not a real answer) — rule 65 §4.
const REFUSAL_REASONS: ReadonlySet<string> = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'])

/** `${baseUrl}/v1beta/models/{model}:streamGenerateContent?alt=sse`, trailing slash + `models/` prefix normalized. */
function streamUrl(baseUrl: string, model: string): string {
  const root = baseUrl.replace(/\/+$/, '')
  const id = model.replace(/^models\//, '') // a `models/`-prefixed id must not double the path segment
  return `${root}/v1beta/models/${id}:streamGenerateContent?alt=sse`
}

export function geminiStream(deps: GeminiDeps): VendorStreamFn {
  return async function* (request: LLMRequest, options: StreamOptions): AsyncIterable<StreamChunk> {
    const model = options.model ?? '' // factory resolves a real model via the registry
    const { system, user } = buildPrompt(request)
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: user }] }],
      systemInstruction: { parts: [{ text: system }] },
      // capabilityOf is undefined for gemini (allowAnyModel) — no clamp; only send when requested.
      ...(options.maxOutputTokens
        ? { generationConfig: { maxOutputTokens: Math.max(1, Math.floor(options.maxOutputTokens)) } }
        : {}),
    })
    const headers = {
      'content-type': 'application/json',
      'x-goog-api-key': deps.apiKey, // never also send Authorization — Gemini 400s on dual auth
    }
    const bytes = fetchStream(
      streamUrl(deps.baseUrl ?? GEMINI_BASE_URL, model),
      { method: 'POST', headers, body },
      { signal: options.signal, timeoutMs: options.timeoutMs, fetch: deps.fetch },
    )

    let produced = false
    let finishReason: string | undefined
    let blockReason: string | undefined

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
      const event = parsed as GeminiSSE
      // An error object can arrive on an HTTP 200 stream — map it (status string, never the message).
      if (event.error) {
        const code = typeof event.error.code === 'number' ? event.error.code : undefined
        throw new ProviderException(
          code !== undefined
            ? errorFromStatus(code)
            : makeProviderError('providerDown', { detail: event.error.status ?? 'stream error' }),
        )
      }
      if (event.promptFeedback?.blockReason) blockReason = event.promptFeedback.blockReason
      const candidate = event.candidates?.[0]
      if (candidate) {
        for (const part of candidate.content?.parts ?? []) {
          if (typeof part.text === 'string' && part.text.length > 0) {
            produced = true
            yield { text: part.text }
          }
        }
        if (candidate.finishReason) finishReason = candidate.finishReason
      }
    }

    // A prompt blocked before generation is a refusal (fallbackable only if nothing was produced).
    if (blockReason) {
      throw new ProviderException(makeProviderError('refusal', { fallbackable: !produced, detail: blockReason }))
    }
    if (finishReason && REFUSAL_REASONS.has(finishReason)) {
      throw new ProviderException(makeProviderError('refusal', { fallbackable: !produced, detail: finishReason }))
    }
    if (finishReason === 'MAX_TOKENS') {
      throw new ProviderException(makeProviderError('incomplete', { detail: 'MAX_TOKENS' }))
    }
    // STOP is the only clean completion; any other terminal reason — or no finishReason at all
    // (stream cut off) — is incomplete.
    if (finishReason !== 'STOP') {
      throw new ProviderException(
        makeProviderError('incomplete', { detail: finishReason ?? 'stream ended before finishReason' }),
      )
    }
  }
}

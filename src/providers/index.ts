// Purpose: the provider factory + public entry point for the LLM layer. UI/feature
// code calls createProvider(vendor, config) and depends only on the returned
// LLMProvider — never on a vendor module. Refuses unimplemented vendors and a
// missing API key up front. Wires the default real backoff sleep into the
// retry/fallback machinery (injectable for tests).

import type { LLMProvider, ProviderConfig, Vendor } from './types'
import { ProviderException } from './types'
import { makeProviderError } from './errors'
import { isVendorImplemented, resolveModel } from './modelRegistry'
import { defineProvider } from './base'
import type { VendorStreamFn } from './base'
import { anthropicStream } from './anthropicProvider'
import { openaiCompatibleStream } from './openaiCompatibleProvider'
import type { RetryDeps } from './retry'

/** Real backoff sleep: resolves after `ms`, or early (without rejecting) if `signal` aborts. */
export function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const settle = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', settle)
      resolve()
    }
    const timer = setTimeout(settle, ms)
    signal?.addEventListener('abort', settle)
  })
}

const defaultRetryDeps: RetryDeps = { sleep: realSleep, random: Math.random }

export function createProvider(
  vendor: Vendor,
  config: ProviderConfig = {},
  deps: RetryDeps = defaultRetryDeps,
): LLMProvider {
  if (!isVendorImplemented(vendor)) {
    throw new ProviderException(makeProviderError('requestFailed', { detail: `provider not implemented: ${vendor}` }))
  }
  if (!config.apiKey) {
    throw new ProviderException(makeProviderError('invalidKey', { detail: 'missing API key' }))
  }
  const model = resolveModel(vendor, config.model)
  let streamFn: VendorStreamFn
  if (vendor === 'custom') {
    // Custom / OpenAI-compatible (#7): user-supplied endpoint + model are required.
    if (!config.baseUrl) {
      throw new ProviderException(makeProviderError('requestFailed', { detail: 'custom provider requires a base URL' }))
    }
    if (!model) {
      throw new ProviderException(makeProviderError('requestFailed', { detail: 'custom provider requires a model' }))
    }
    streamFn = openaiCompatibleStream({ apiKey: config.apiKey, baseUrl: config.baseUrl, fetch: config.fetch })
  } else {
    // Anthropic today; #5 adds OpenAI/Gemini/Ollama branches (Ollama/OpenAI reuse openaiCompatibleStream).
    streamFn = anthropicStream({ apiKey: config.apiKey, baseUrl: config.baseUrl, fetch: config.fetch })
  }
  return defineProvider({ vendor, model, streamFn, retry: deps })
}

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
import { anthropicStream } from './anthropicProvider'
import type { RetryDeps } from './retry'

/** Real backoff sleep: resolves after `ms`, or early (without rejecting) if `signal` aborts. */
export function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
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
  // Anthropic is the only implemented vendor; #2 adds a vendor switch here.
  const streamFn = anthropicStream({ apiKey: config.apiKey, baseUrl: config.baseUrl, fetch: config.fetch })
  return defineProvider({ vendor, model, streamFn, retry: deps })
}

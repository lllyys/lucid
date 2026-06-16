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
import { geminiStream } from './geminiProvider'
import type { RetryDeps } from './retry'
import { realSleep } from '@/lib/async/backoff'

// Fixed endpoints for the named vendors (endpoints, not model IDs — model IDs live in the registry).
const OPENAI_BASE_URL = 'https://api.openai.com/v1'
const OLLAMA_BASE_URL = 'http://localhost:11434/v1'

const defaultRetryDeps: RetryDeps = { sleep: realSleep, random: Math.random }

export function createProvider(
  vendor: Vendor,
  config: ProviderConfig = {},
  deps: RetryDeps = defaultRetryDeps,
): LLMProvider {
  if (!isVendorImplemented(vendor)) {
    throw new ProviderException(makeProviderError('requestFailed', { detail: `provider not implemented: ${vendor}` }))
  }
  // Ollama runs locally and needs no key; custom's key is OPTIONAL (keyless self-hosted OR a keyed
  // proxy like OpenRouter — #5/#7/#29). The named remote vendors require a key up front.
  if (vendor !== 'ollama' && vendor !== 'custom' && !config.apiKey) {
    throw new ProviderException(makeProviderError('invalidKey', { detail: 'missing API key' }))
  }
  const model = resolveModel(vendor, config.model)
  const apiKey = config.apiKey ?? ''
  // One builder per vendor (Record is exhaustive over Vendor — no fall-through default to leave
  // a vendor silently on the wrong adapter). UI/feature code never sees which engine backs a vendor.
  const buildStream: Record<Vendor, () => VendorStreamFn> = {
    anthropic: () => anthropicStream({ apiKey, baseUrl: config.baseUrl, fetch: config.fetch }),
    openai: () => openaiCompatibleStream({ apiKey, baseUrl: OPENAI_BASE_URL, fetch: config.fetch }),
    ollama: () => openaiCompatibleStream({ apiKey: apiKey || 'ollama', baseUrl: OLLAMA_BASE_URL, fetch: config.fetch }),
    gemini: () => geminiStream({ apiKey, baseUrl: config.baseUrl, fetch: config.fetch }),
    custom: () => {
      // Custom / OpenAI-compatible (#7): user-supplied endpoint + model are required.
      if (!config.baseUrl) {
        throw new ProviderException(makeProviderError('requestFailed', { detail: 'custom provider requires a base URL' }))
      }
      if (!model) {
        throw new ProviderException(makeProviderError('requestFailed', { detail: 'custom provider requires a model' }))
      }
      return openaiCompatibleStream({ apiKey, baseUrl: config.baseUrl, fetch: config.fetch })
    },
  }
  return defineProvider({ vendor, model, streamFn: buildStream[vendor](), retry: deps })
}

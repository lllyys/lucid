// Purpose: the provider-agnostic core that turns a vendor's stream function into
// an LLMProvider. `collectStream` consumes a single stream attempt into a terminal
// ProviderOutcome (mapping thrown errors and sanitizing detail at the outcome
// boundary). `withFallback` walks the registry model chain (cross-model). The two
// resilience layers compose in `defineProvider`: withFallback(chain, model =>
// withRetry(() => collectStream(streamFn(...model)))). Vendor adapters (WI-5)
// supply the VendorStreamFn; UI/feature code only ever sees the LLMProvider.

import type {
  LLMProvider,
  LLMRequest,
  PolishRequest,
  ProviderError,
  ProviderOutcome,
  StreamChunk,
  StreamOptions,
  TranslateRequest,
  Vendor,
} from './types'
import { errorFromStatus, isAbortError, makeProviderError, toProviderError } from './errors'
import { sanitizeDetail } from './redact'
import { withRetry, type RetryDeps } from './retry'
import { ProviderHttpError } from './stream'
import { modelChain } from './modelRegistry'

/** Internal: a vendor's raw single-attempt stream. Not part of the public contract. */
export type VendorStreamFn = (request: LLMRequest, options: StreamOptions) => AsyncIterable<StreamChunk>

/** Consume one stream attempt into a terminal outcome. Sanitizes detail at the boundary. */
export async function collectStream(
  stream: AsyncIterable<StreamChunk>,
  options: { signal?: AbortSignal } = {},
): Promise<ProviderOutcome> {
  let text = ''
  try {
    if (options.signal?.aborted) return { status: 'cancelled', text }
    for await (const chunk of stream) {
      if (options.signal?.aborted) return { status: 'cancelled', text }
      text += chunk.text
    }
    if (options.signal?.aborted) return { status: 'cancelled', text }
    return { status: 'done', text }
  } catch (err) {
    if (isAbortError(err) || options.signal?.aborted) return { status: 'cancelled', text }
    const mapped =
      err instanceof ProviderHttpError
        ? errorFromStatus(err.status, { retryAfter: err.retryAfter, detail: err.bodyText })
        : toProviderError(err)
    const error: ProviderError =
      mapped.detail === undefined ? mapped : { ...mapped, detail: sanitizeDetail(mapped.detail) }
    return { status: 'error', text, error }
  }
}

/**
 * Cross-model degradation: try each model in `chain`, advancing ONLY on a
 * zero-output fallbackable error. Never replays after partial output, on a
 * cancellation, or on a non-fallbackable error (rule 65 §2).
 */
export async function withFallback(
  chain: string[],
  run: (model: string) => Promise<ProviderOutcome>,
): Promise<ProviderOutcome> {
  let last: ProviderOutcome | undefined
  for (const model of chain) {
    last = await run(model)
    if (last.status !== 'error' || last.error.fallbackable !== true || last.text !== '') {
      return last
    }
  }
  return last ?? { status: 'error', text: '', error: makeProviderError('unknown') }
}

export interface DefineProviderConfig {
  vendor: Vendor
  model: string
  streamFn: VendorStreamFn
  retry: RetryDeps
}

export function defineProvider(config: DefineProviderConfig): LLMProvider {
  const { vendor, model, streamFn, retry } = config

  // Wrap streamFn in a lazy generator so even a SYNCHRONOUS throw from it lands
  // inside collectStream's try — translate()/polish() always resolve to a
  // ProviderOutcome, never reject.
  const attempt = (request: LLMRequest, options: StreamOptions, attemptModel: string) =>
    collectStream(
      (async function* () {
        yield* streamFn(request, { ...options, model: attemptModel })
      })(),
      { signal: options.signal },
    )

  const run = (request: LLMRequest, options: StreamOptions): Promise<ProviderOutcome> =>
    withFallback(modelChain(vendor, options.model ?? model), (attemptModel) =>
      withRetry(() => attempt(request, options, attemptModel), { maxAttempts: 3, signal: options.signal }, retry),
    )

  return {
    vendor,
    model,
    stream: (request, options = {}) => streamFn(request, { ...options, model: options.model ?? model }),
    translate: (request: TranslateRequest, options = {}) => run(request, options),
    polish: (request: PolishRequest, options = {}) => run(request, options),
  }
}

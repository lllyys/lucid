// Purpose: the provider-agnostic core that turns a vendor's stream function into an
// LLMProvider. `collectStream` consumes a single attempt into a terminal ProviderOutcome
// (mapping thrown errors via the shared `mapStreamError`). `streamOp` is the resilient,
// normalized STREAMING primitive (feature #2): it yields chunks and RETURNS a normalized
// outcome, with request validation, a default timeout, and pre-first-byte retry/fallback —
// the consumer maps nothing. `withFallback` walks the registry model chain. Vendor adapters
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
import { ProviderException } from './types'
import { errorFromStatus, isAbortError, isRetryableError, makeProviderError, toProviderError } from './errors'
import { sanitizeDetail } from './redact'
import { backoffDelay, RETRY_DEFAULTS, withRetry, type RetryDeps } from './retry'
import { ProviderHttpError } from './stream'
import { modelChain } from './modelRegistry'
import { validateRequest } from '@/lib/prompts'

/** Internal: a vendor's raw single-attempt stream. Not part of the public contract. */
export type VendorStreamFn = (request: LLMRequest, options: StreamOptions) => AsyncIterable<StreamChunk>

/** Default request timeout when a caller omits one (rule 65 §4 — every request is bounded). */
const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Map a thrown stream error to a terminal outcome — shared by collectStream + streamOp.
 * A user abort → cancelled; a ProviderHttpError → errorFromStatus; anything else →
 * toProviderError. Detail is sanitized at the boundary so no secret leaks (rule 65 §5).
 */
export function mapStreamError(err: unknown, signal: AbortSignal | undefined, text: string): ProviderOutcome {
  if (isAbortError(err) || signal?.aborted) return { status: 'cancelled', text }
  const mapped =
    err instanceof ProviderHttpError
      ? errorFromStatus(err.status, { retryAfter: err.retryAfter, detail: err.bodyText })
      : toProviderError(err)
  const error: ProviderError =
    mapped.detail === undefined ? mapped : { ...mapped, detail: sanitizeDetail(mapped.detail) }
  return { status: 'error', text, error }
}

/** Consume one stream attempt into a terminal outcome. */
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
    return mapStreamError(err, options.signal, text)
  }
}

/**
 * Resilient, normalized streaming primitive (feature #2). Yields chunks and returns a
 * terminal ProviderOutcome. In the PRE-FIRST-BYTE window it retries a transient zero-byte
 * error on the same model (a timeout at most once) and falls back across the model chain on
 * a zero-output fallbackable error; once a chunk is yielded it streams to completion and
 * NEVER replays (rule 65 §4). Reuses mapStreamError / isRetryableError / backoffDelay /
 * RETRY_DEFAULTS so its policy matches withRetry exactly.
 */
async function* streamOpGen(
  vendor: Vendor,
  defaultModel: string,
  streamFn: VendorStreamFn,
  retry: RetryDeps,
  request: LLMRequest,
  options: StreamOptions,
): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
  const validation = validateRequest(request)
  if (validation) return { status: 'error', text: '', error: validation }

  const { signal } = options
  const opts: StreamOptions = { timeoutMs: DEFAULT_TIMEOUT_MS, ...options }
  const chain = modelChain(vendor, options.model ?? defaultModel)
  let last: ProviderOutcome = { status: 'error', text: '', error: makeProviderError('unknown') }

  for (const attemptModel of chain) {
    let timeoutRetried = false
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) return { status: 'cancelled', text: '' }
      let text = ''
      let yielded = false
      try {
        for await (const chunk of streamFn(request, { ...opts, model: attemptModel })) {
          if (signal?.aborted) return { status: 'cancelled', text }
          text += chunk.text
          yielded = true
          yield { text: chunk.text }
        }
        if (signal?.aborted) return { status: 'cancelled', text }
        return { status: 'done', text }
      } catch (err) {
        const outcome = mapStreamError(err, signal, text)
        // Cancelled, or any partial output already streamed → surface; never replay.
        if (outcome.status !== 'error' || yielded) return outcome
        last = outcome
        // Zero-byte error: retry the same model while transient + under the cap (a timeout
        // at most once), then fall back across models if eligible.
        if (isRetryableError(outcome.error)) {
          const isTimeout = outcome.error.kind === 'timeout'
          if (attempt < RETRY_DEFAULTS.maxAttempts - 1 && !(isTimeout && timeoutRetried)) {
            if (isTimeout) timeoutRetried = true
            await retry.sleep(
              backoffDelay(outcome.error, attempt, RETRY_DEFAULTS.baseDelayMs, RETRY_DEFAULTS.maxDelayMs, retry.random),
              signal,
            )
            if (signal?.aborted) return { status: 'cancelled', text: '' }
            continue
          }
        }
        if (outcome.error.fallbackable === true) break
        return outcome
      }
    }
  }
  return last
}

/**
 * Cross-model degradation: try each model in `chain`, advancing ONLY on a zero-output
 * fallbackable error. Never replays after partial output, on a cancellation, or on a
 * non-fallbackable error (rule 65 §2).
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

  // Wrap streamFn in a lazy generator so even a SYNCHRONOUS throw lands inside
  // collectStream's try — translate()/polish() always resolve to an outcome, never reject.
  const attempt = (request: LLMRequest, options: StreamOptions, attemptModel: string) =>
    collectStream(
      (async function* () {
        yield* streamFn(request, { ...options, model: attemptModel })
      })(),
      { signal: options.signal },
    )

  const run = (request: LLMRequest, options: StreamOptions): Promise<ProviderOutcome> => {
    const validation = validateRequest(request)
    if (validation) return Promise.resolve({ status: 'error', text: '', error: validation })
    const opts: StreamOptions = { timeoutMs: DEFAULT_TIMEOUT_MS, ...options }
    return withFallback(modelChain(vendor, opts.model ?? model), (attemptModel) =>
      withRetry(
        () => attempt(request, opts, attemptModel),
        { maxAttempts: RETRY_DEFAULTS.maxAttempts, signal: opts.signal },
        retry,
      ),
    )
  }

  return {
    vendor,
    model,
    stream: (request, options = {}) => {
      const validation = validateRequest(request)
      if (validation) {
        // Invalid request: an AsyncIterable that rejects with the typed error on first read
        // (stream() throws ProviderException on failure — keeps that contract without a yield).
        const error = new ProviderException(validation)
        return { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }) }
      }
      return streamFn(request, { ...options, model: options.model ?? model })
    },
    streamOp: (request, options = {}) => streamOpGen(vendor, model, streamFn, retry, request, options),
    translate: (request: TranslateRequest, options = {}) => run(request, options),
    polish: (request: PolishRequest, options = {}) => run(request, options),
  }
}

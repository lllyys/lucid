// Purpose: same-model transient retry with exponential backoff + jitter (rule 65 §4).
// Retries ONLY a retryable error that streamed zero bytes; never an abort, a 4xx,
// a refusal/incomplete/validation, or any outcome with partial text. Abort-aware:
// the policy's signal short-circuits before each attempt, before sleep, and after.
// Distinct from cross-model fallback (withFallback, base.ts, WI-3).

import type { ProviderError, ProviderOutcome } from './types'

export interface RetryPolicy {
  maxAttempts?: number
  signal?: AbortSignal
  baseDelayMs?: number
  maxDelayMs?: number
}

export interface RetryDeps {
  /** Resolves after `ms`, or early if `signal` aborts (must not reject). */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  /** [0, 1) jitter source; injected for deterministic tests. */
  random: () => number
}

const CANCELLED: ProviderOutcome = { status: 'cancelled', text: '' }

function backoffDelay(
  error: ProviderError,
  attemptIndex: number,
  base: number,
  max: number,
  random: () => number,
): number {
  if (error.kind === 'rateLimited' && error.retryAfterMs != null) {
    return Math.min(error.retryAfterMs, max)
  }
  const exp = Math.min(base * 2 ** attemptIndex, max)
  return random() * exp
}

export async function withRetry(
  attempt: () => Promise<ProviderOutcome>,
  policy: RetryPolicy,
  deps: RetryDeps,
): Promise<ProviderOutcome> {
  const maxAttempts = policy.maxAttempts ?? 3
  const base = policy.baseDelayMs ?? 500
  const max = policy.maxDelayMs ?? 30_000
  const signal = policy.signal
  let timeoutRetried = false

  for (let i = 0; ; i++) {
    if (signal?.aborted) return CANCELLED

    const outcome = await attempt()

    // Retry only a retryable error that streamed nothing yet.
    if (outcome.status !== 'error' || !outcome.error.retryable || outcome.text !== '') {
      return outcome
    }

    // A timeout is retried at most once.
    if (outcome.error.kind === 'timeout') {
      if (timeoutRetried) return outcome
      timeoutRetried = true
    }

    if (i >= maxAttempts - 1) return outcome

    if (signal?.aborted) return CANCELLED
    await deps.sleep(backoffDelay(outcome.error, i, base, max, deps.random), signal)
    if (signal?.aborted) return CANCELLED
  }
}

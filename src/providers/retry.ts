// Purpose: same-model transient retry with exponential backoff + jitter (rule 65 §4).
// Retries ONLY a retryable error that streamed zero bytes; never an abort, a 4xx,
// a refusal/incomplete/validation, or any outcome with partial text. Abort-aware:
// the policy's signal short-circuits before each attempt, before sleep, and after.
// Distinct from cross-model fallback (withFallback, base.ts, WI-3).

import type { ProviderError, ProviderOutcome } from './types'
import { isRetryableError } from './errors'

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

// A server-directed Retry-After is honored up to this safety bound — independent
// of the exponential-backoff cap (maxDelayMs), which must not shorten it.
const RATE_LIMIT_MAX_MS = 60_000

/** Coerce any delay to a finite, non-negative, bounded value before it reaches sleep(). */
function clampMs(ms: number, max: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.min(ms, max)
}

function backoffDelay(
  error: ProviderError,
  attemptIndex: number,
  base: number,
  max: number,
  random: () => number,
): number {
  if (error.kind === 'rateLimited' && error.retryAfterMs != null) {
    return clampMs(error.retryAfterMs, RATE_LIMIT_MAX_MS)
  }
  const exp = Math.min(base * 2 ** attemptIndex, max)
  return clampMs(random() * exp, max)
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

    // Retry only a transient (retryable kind + flag) error that streamed nothing yet.
    if (outcome.status !== 'error' || !isRetryableError(outcome.error) || outcome.text !== '') {
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

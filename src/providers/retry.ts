// Purpose: same-model transient retry with exponential backoff + jitter (rule 65 §4).
// Retries ONLY a retryable error that streamed zero bytes; never an abort, a 4xx,
// a refusal/incomplete/validation, or any outcome with partial text. Abort-aware:
// the policy's signal short-circuits before each attempt, before sleep, and after.
// Distinct from cross-model fallback (withFallback, base.ts, WI-3).

import type { ProviderError, ProviderOutcome } from './types'
import { isRetryableError } from './errors'
import { clampMs, expBackoff } from '@/lib/async/backoff'

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

// Shared retry policy — the single source for both withRetry (collect-to-completion)
// and the streaming pre-first-byte retry in base.ts (rule 65 §4). Kept here so the two
// paths never drift.
export const RETRY_DEFAULTS = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 30_000 } as const

export function backoffDelay(
  error: ProviderError,
  attemptIndex: number,
  base: number,
  max: number,
  random: () => number,
): number {
  // A server-directed Retry-After overrides the exponential schedule (provider-specific); the
  // generic jittered-exponential path is the shared primitive (src/lib/async/backoff).
  if (error.kind === 'rateLimited' && error.retryAfterMs != null) {
    return clampMs(error.retryAfterMs, RATE_LIMIT_MAX_MS)
  }
  return expBackoff(attemptIndex, base, max, random)
}

export async function withRetry(
  attempt: () => Promise<ProviderOutcome>,
  policy: RetryPolicy,
  deps: RetryDeps,
): Promise<ProviderOutcome> {
  const maxAttempts = policy.maxAttempts ?? RETRY_DEFAULTS.maxAttempts
  const base = policy.baseDelayMs ?? RETRY_DEFAULTS.baseDelayMs
  const max = policy.maxDelayMs ?? RETRY_DEFAULTS.maxDelayMs
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

// Purpose: map raw failures (thrown JS errors, HTTP status, Retry-After headers)
// into the shared ProviderError shape (rule 65 §4). Every failure becomes a
// localized, user-facing error — never a raw stack trace. No secrets in `detail`.

import type { ErrorKind, ProviderError } from './types'
import { ProviderException } from './types'
import { sanitizeDetail } from './redact'

const MESSAGE_KEY: Record<ErrorKind, string> = {
  rateLimited: 'error.rateLimited',
  providerDown: 'error.providerDown',
  invalidKey: 'error.invalidKey',
  requestFailed: 'error.requestFailed',
  timeout: 'error.timeout',
  aborted: 'error.aborted',
  refusal: 'error.refusal',
  incomplete: 'error.incomplete',
  validation: 'error.validation',
  unknown: 'error.unknown',
}

// Only transient failures are retryable on the same model (rule 65 §4).
const RETRYABLE: ReadonlySet<ErrorKind> = new Set<ErrorKind>(['rateLimited', 'providerDown', 'timeout'])

const MAX_RETRY_AFTER_MS = 60_000

export interface ProviderErrorOptions {
  fallbackable?: boolean
  retryAfterMs?: number
  detail?: string
}

export function makeProviderError(kind: ErrorKind, opts: ProviderErrorOptions = {}): ProviderError {
  const error: ProviderError = {
    kind,
    messageKey: MESSAGE_KEY[kind],
    retryable: RETRYABLE.has(kind),
  }
  if (opts.fallbackable !== undefined) error.fallbackable = opts.fallbackable
  if (opts.retryAfterMs !== undefined) error.retryAfterMs = opts.retryAfterMs
  if (opts.detail !== undefined) error.detail = sanitizeDetail(opts.detail)
  return error
}

/**
 * Authoritative retry-eligibility check: a transient error KIND AND the
 * retryable flag must agree. Guards against a directly-constructed or malformed
 * ProviderError that contradicts itself (e.g. invalidKey marked retryable).
 */
export function isRetryableError(error: ProviderError): boolean {
  return RETRYABLE.has(error.kind) && error.retryable === true
}

/** True only for a user-initiated abort (AbortError) — not a timeout. */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'AbortError'
  )
}

export function classifyStatus(status: number): ErrorKind {
  if (status === 401 || status === 403) return 'invalidKey'
  if (status === 429) return 'rateLimited'
  if (status === 504) return 'timeout' // Gateway Timeout — retried once, not as a 5xx outage
  if (status >= 500) return 'providerDown'
  if (status >= 400) return 'requestFailed'
  return 'unknown'
}

/**
 * Parse a Retry-After header (delta-seconds OR HTTP-date) into bounded ms.
 * Invalid, blank, negative, or past values yield undefined.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    // The regex guarantees a non-negative numeric string; an astronomically
    // long one overflows to Infinity and is then clamped by Math.min.
    return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS)
  }
  const ts = Date.parse(trimmed)
  if (Number.isNaN(ts)) return undefined
  const delta = ts - nowMs
  if (delta <= 0) return undefined
  return Math.min(delta, MAX_RETRY_AFTER_MS)
}

export interface StatusErrorOptions {
  retryAfter?: string | null
  detail?: string
  nowMs?: number
}

/** Build a ProviderError from an HTTP status (+ optional Retry-After). */
export function errorFromStatus(status: number, opts: StatusErrorOptions = {}): ProviderError {
  const kind = classifyStatus(status)
  const retryAfterMs =
    kind === 'rateLimited' ? parseRetryAfter(opts.retryAfter, opts.nowMs) : undefined
  return makeProviderError(kind, { retryAfterMs, detail: opts.detail })
}

/** Map a thrown JS error (abort, timeout, network, ProviderException, …) to a ProviderError. */
export function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderException) return err.providerError
  const name =
    typeof err === 'object' && err !== null && 'name' in err
      ? String((err as { name: unknown }).name)
      : ''
  const detail = err instanceof Error ? err.message : typeof err === 'string' ? err : undefined
  if (name === 'TimeoutError') return makeProviderError('timeout', { detail })
  if (name === 'AbortError') return makeProviderError('aborted', { detail })
  if (err instanceof TypeError) return makeProviderError('providerDown', { detail })
  return makeProviderError('unknown', { detail })
}

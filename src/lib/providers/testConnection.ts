// Purpose: the "test connection" probe (feature #6 — #28). Makes ONE minimal authenticated request
// through the provider interface and reports whether the active vendor/key/endpoint actually works,
// with a measured first-byte latency. Uses the RAW single-attempt `stream()` (NOT translate/streamOp)
// so retry/fallback can't mask the true connection state, and reuses the layer's `mapStreamError` so a
// failure is classified exactly like a real run (rule 65 §4). The key is never logged or returned
// (mapStreamError sanitizes detail; we surface only the ErrorKind — rule 65 §5). Bounded by a timeout
// so a hung endpoint fails. NEVER run in `pnpm check:all` — mocked at the fetch boundary in tests.

import type { ErrorKind, LLMProvider, TranslateRequest } from '@/providers/types'
import { mapStreamError } from '@/providers/base'

/** A tiny, always-valid request: non-empty text + a supported target language (passes validateRequest). */
const PROBE_REQUEST: TranslateRequest = { kind: 'translate', text: 'ping', targetLang: 'en' }
const DEFAULT_PROBE_TIMEOUT_MS = 10_000

export interface ProbeOptions {
  signal?: AbortSignal
  /** Deadline for the probe; passed straight into stream() (which has no default timeout). */
  timeoutMs?: number
  /** Injectable clock for deterministic latency in tests (defaults to Date.now). */
  now?: () => number
}

export type ProbeResult = { ok: true; latencyMs: number } | { ok: false; kind: ErrorKind }

/**
 * Probe a provider's connectivity. Resolves to `{ ok:true, latencyMs }` once the first byte arrives
 * (or the stream completes cleanly with no output), or `{ ok:false, kind }` mapped from the failure.
 * A user abort maps to `aborted`. Never throws.
 */
export async function probeProvider(provider: LLMProvider, options: ProbeOptions = {}): Promise<ProbeResult> {
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  const start = now()
  try {
    const stream = provider.stream(PROBE_REQUEST, { signal: options.signal, timeoutMs, maxOutputTokens: 1 })
    for await (const chunk of stream) {
      void chunk
      break // first byte proves the connection; closing the loop releases the request (no full generation)
    }
    return { ok: true, latencyMs: Math.max(0, now() - start) }
  } catch (err) {
    const outcome = mapStreamError(err, options.signal, '')
    // mapStreamError yields only 'error' or 'cancelled' here; a cancellation surfaces as `aborted`.
    if (outcome.status === 'error') return { ok: false, kind: outcome.error.kind }
    return { ok: false, kind: 'aborted' }
  }
}

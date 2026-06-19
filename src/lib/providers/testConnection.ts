// Purpose: the "test connection" probe (feature #6 — #28). Makes ONE minimal authenticated request
// through the provider interface and reports whether the active vendor/key/endpoint actually works,
// with a measured first-byte latency. Uses the RAW single-attempt `stream()` (NOT translate/streamOp)
// so retry/fallback can't mask the true connection state, and reuses the layer's `mapStreamError` so a
// failure is classified exactly like a real run (rule 65 §4). It verifies REACHABILITY + AUTH, not
// completion: a reply that hits the probe's tiny output cap (`incomplete`/finish_reason 'length') counts
// as connected, since the endpoint answered and the key was accepted (bug #126); only auth/rate-limit/
// outage/timeout fail. The key is never logged or returned (mapStreamError sanitizes detail; we surface
// only the ErrorKind — rule 65 §5). Bounded by a timeout so a hung endpoint fails. NEVER run in
// `pnpm check:all` — mocked at the fetch boundary in tests.

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
 * Probe a provider's connectivity. Resolves to `{ ok:true, latencyMs }` once the first byte arrives,
 * the stream completes cleanly with no output, OR it hits the probe's token cap (`incomplete`) — all
 * three prove the endpoint replied and the key is valid. Resolves to `{ ok:false, kind }` for a real
 * failure (auth, rate-limit, outage, timeout). A user abort maps to `aborted`. Never throws.
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
    // An `incomplete` outcome proves connectivity, not failure: the probe sends a tiny maxOutputTokens
    // cap, so an OpenAI-compatible endpoint finishes with finish_reason 'length' → `incomplete`, and a
    // reasoning model can hit the cap before any visible byte (so the success-on-first-chunk path above
    // never fires). The endpoint replied and the key is valid — that's what the probe verifies, not
    // completion. Treat it as connected (bug #126). Auth/rate-limit/outage map to their own kinds → fail.
    if (outcome.status === 'error' && outcome.error.kind === 'incomplete') {
      return { ok: true, latencyMs: Math.max(0, now() - start) }
    }
    // mapStreamError yields only 'error' or 'cancelled' here; a cancellation surfaces as `aborted`.
    if (outcome.status === 'error') return { ok: false, kind: outcome.error.kind }
    return { ok: false, kind: 'aborted' }
  }
}

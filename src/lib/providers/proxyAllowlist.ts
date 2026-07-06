// Purpose: a tiny module-level cache of the server's advertised same-origin LLM-proxy allow-list (#28).
// The sync controller (`syncController.launch()`) refreshes it on a token-free single-origin connect via
// `GET /proxy`; the run + Test-connection call sites (usePanelRun / useTestConnection) read it to decide
// `shouldProxy`. The default is `[]` — an empty cache, a non-single-origin connect, or any fetch failure
// / bad shape all resolve to `[]`, so the client stays DIRECT-by-default (no regression).

let cached: string[] = []

/** The currently-cached allow-list (the server's advertised upstreams; `[]` when disabled/unknown). */
export function getProxyAllowlist(): string[] {
  return cached
}

/** Overwrite the cache (used by the WI-3 call-site tests + the refresh below). */
export function setProxyAllowlist(list: string[]): void {
  cached = list
}

/** Reset to `[]` — a non-single-origin connect / disconnect clears any prior server's advertisement. */
export function clearProxyAllowlist(): void {
  cached = []
}

/** Narrow the `GET /proxy` JSON to `{ upstreams: string[] }`. */
function isUpstreamsShape(value: unknown): value is { upstreams: string[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { upstreams?: unknown }).upstreams) &&
    (value as { upstreams: unknown[] }).upstreams.every((u) => typeof u === 'string')
  )
}

/**
 * Fetch `GET ${origin}/proxy` and cache the advertised upstreams. ANY failure — non-2xx, unparseable
 * body, wrong shape, or a thrown fetch — caches (and returns) `[]`, so a server without the proxy
 * enabled (or an unreachable one) leaves the client fully DIRECT. Injectable fetch for tests.
 */
export async function refreshProxyAllowlist(origin: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  try {
    const res = await fetchFn(`${origin}/proxy`)
    if (!res.ok) {
      cached = []
      return cached
    }
    const data: unknown = await res.json()
    cached = isUpstreamsShape(data) ? data.upstreams : []
    return cached
  } catch {
    cached = []
    return cached
  }
}

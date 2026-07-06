// Purpose: the SSRF allow-list + upstream-URL logic for the same-origin LLM proxy (#28). The browser
// cannot reach a CORS-less / mixed-content / private-IP custom LLM endpoint directly, so `@lucid/server`
// (already serving the app single-origin) RELAYS the request server-side. This module is the pure,
// unit-tested core of that relay: it parses the operator's env allow-list (`PROXY_ALLOWED_UPSTREAMS`)
// and decides whether a client-supplied upstream base URL is on it.
//
// Security (rule 65 §5): the relay is bounded to an operator-named set of full base URLs — the browser
// can never make the server fetch an arbitrary host. `app.ts` appends the FIXED `/chat/completions`
// path to a LISTED base URL (never a client path) and uses `redirect: 'error'` so a 3xx can't hop past
// this allow-list check. The client (`src/lib/providers/proxyRoute.ts`) mirrors `normalizeUpstream`'s
// trailing-slash rule so a normalization mismatch fails SAFE to the direct path.

/**
 * Trim + strip trailing slashes off a base URL, returning null when it is not a valid http|https URL.
 * The one place the base-URL normalization rule lives on the server; the client mirrors it (a mismatch
 * simply fails safe to the direct path). Case is preserved verbatim (the URL parse only validates the
 * scheme) so the client and server compare identical strings for a user who types consistently.
 */
export function normalizeUpstream(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return trimmed.replace(/\/+$/, '')
}

/**
 * Parse `PROXY_ALLOWED_UPSTREAMS` (comma-separated FULL base URLs, e.g.
 * `http://100.80.151.31:8000/v1,http://localhost:11434/v1`) into a normalized, de-duplicated list.
 * Blank / invalid / non-http(s) entries are dropped. undefined or empty → `[]` (the proxy is disabled;
 * `POST /proxy` 403s and `GET /proxy` advertises `[]`, so the client never proxies — direct-by-default).
 */
export function parseAllowedUpstreams(raw: string | undefined): string[] {
  if (raw === undefined) return []
  const out: string[] = []
  for (const part of raw.split(',')) {
    const normalized = normalizeUpstream(part)
    if (normalized !== null && !out.includes(normalized)) out.push(normalized)
  }
  return out
}

/**
 * True iff `target` normalizes to a base URL that EXACTLY matches a listed one (full base-URL match,
 * not an origin/prefix match — a path/host/scheme mismatch is rejected). An invalid target or an empty
 * allow-list → false. This is the pre-fetch SSRF gate the `POST /proxy` route consults.
 */
export function isAllowedUpstream(target: string, allowed: string[]): boolean {
  const normalized = normalizeUpstream(target)
  return normalized !== null && allowed.includes(normalized)
}

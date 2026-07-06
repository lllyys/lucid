// Purpose: the client-side routing decision for the same-origin LLM proxy (#28). A custom/local endpoint
// the browser can't reach directly (CORS-less, mixed-content, private-IP) is relayed by `@lucid/server`
// only when it is SAFE and USEFUL: the user is connected token-free single-origin AND the provider's
// base URL is on the server's advertised allow-list (fetched + cached on connect — proxyAllowlist.ts).
// Every other case uses the existing DIRECT path unchanged (direct-by-default, no regression).
//
// `normalizeBaseUrl` mirrors the server's `normalizeUpstream` trailing-slash + scheme rule EXACTLY, so
// the client and server compare identical strings; a normalization mismatch simply fails safe to direct.

import type { Vendor } from '@/providers/types'

/**
 * Trim + strip trailing slashes off a base URL, returning null when it is not a valid http|https URL.
 * MUST mirror the server's `server/src/proxy.ts` `normalizeUpstream` (the two packages can't share code,
 * so the rule is duplicated — a mismatch fails safe to the direct path).
 */
export function normalizeBaseUrl(raw: string): string | null {
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

export interface ShouldProxyInput {
  /** The user is connected token-free single-origin: `config.serverUrl === location.origin && token === ''`. */
  singleOrigin: boolean
  /** The server's advertised proxy allow-list (cached on connect; `[]` when disabled). */
  allowed: string[]
  /** The active vendor — only a `custom` provider is ever proxied. */
  vendor: Vendor
  /** The custom provider's endpoint base URL. */
  baseUrl: string
}

/**
 * True iff the request should be relayed through the same-origin proxy: token-free single-origin AND a
 * `custom` vendor AND the normalized base URL is on the allow-list. Every other case → false → direct.
 */
export function shouldProxy(input: ShouldProxyInput): boolean {
  if (!input.singleOrigin || input.vendor !== 'custom') return false
  const normalized = normalizeBaseUrl(input.baseUrl)
  return normalized !== null && input.allowed.includes(normalized)
}

/**
 * Build the same-origin proxy target: POST `${origin}/proxy` with the normalized base URL as the
 * `x-lucid-proxy-upstream` header (the server appends `/chat/completions` to it). Falls back to the raw
 * base URL if it does not normalize (defensive — `shouldProxy` already gated a real match).
 */
export function proxyTarget(origin: string, baseUrl: string): { url: string; upstreamHeader: string } {
  return { url: `${origin}/proxy`, upstreamHeader: normalizeBaseUrl(baseUrl) ?? baseUrl }
}

export interface ResolveProxyInput {
  vendor: Vendor
  /** The active target's endpoint base URL (undefined/'' for a built-in with no user URL). */
  baseUrl: string | undefined
  /** `window.location.origin` — the served origin. */
  origin: string
  /** The live sync connection config (null = local-only). */
  syncConfig: { serverUrl: string; token: string } | null
  /** The cached server proxy allow-list. */
  allowed: string[]
}

/**
 * The SINGLE resolver both call sites (usePanelRun, useTestConnection) and the footer privacy line use
 * so they AGREE on when to proxy (#28). Returns the `{ origin, upstream }` proxy config to pass into
 * `createProvider`, or undefined for the direct path. Pure — the caller reads the stores + allow-list
 * cache and passes them in. Single-origin = the sync server IS this origin AND is token-free.
 */
export function resolveProxyConfig(input: ResolveProxyInput): { origin: string; upstream: string } | undefined {
  if (!input.baseUrl) return undefined
  const singleOrigin =
    input.syncConfig !== null && input.syncConfig.serverUrl === input.origin && input.syncConfig.token === ''
  if (!shouldProxy({ singleOrigin, allowed: input.allowed, vendor: input.vendor, baseUrl: input.baseUrl })) {
    return undefined
  }
  return { origin: input.origin, upstream: proxyTarget(input.origin, input.baseUrl).upstreamHeader }
}

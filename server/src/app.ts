// Purpose: the Hono HTTP layer for the self-hosted sync server (#9, WI-8c/WI-8d; #19 WI-1). `createApp`
// builds the app from injected deps (the SQLite store + the expected bearer token + an optional body-size
// cap + an optional staticDir) — it reads NO env (that is the WI-8d entry's job). It exposes the three
// routes the lucid web client (src/lib/sync/backend.ts) calls, and maps every failure to the status the
// client's status→error mapping expects: 401/403 → 'auth', other 4xx → 'badRequest', 5xx → 'unreachable'.
// The POST route additionally caps the request body (WI-8d): an over-cap body → 413.
//
// /sync auth — the FOUR quadrants of (staticDir, token), decided by ONE shared `tokenFree` boolean
// (#19 WI-1) so the startup-throw skip and the middleware choice can never drift:
//   const tokenFree = staticDir set AND token.trim() === '' (whitespace-only collapses to empty)
//   | staticDir | token | /sync behavior                                                |
//   |-----------|-------|--------------------------------------------------------------|
//   | set       | empty | TOKEN-FREE: pass-through guard; origin + Tailscale ACL is the |
//   |           |       | boundary. Any Authorization header (e.g. a stale Bearer x)   |
//   |           |       | is IGNORED, never rejected.                                  |
//   | set       | set   | bearer-authed (a single-origin server that ALSO wants a      |
//   |           |       | token MUST stay protected — quadrant-2 regression).          |
//   | unset     | empty | THROW at startup (an API-only server with no auth is a       |
//   |           |       | footgun — preserved).                                        |
//   | unset     | set   | bearer-authed (unchanged).                                   |
// Token-free /sync carries PLAINTEXT workspace data reachable by anyone on the tailnet — strictly weaker
// than the typed token, the user's "like #15 /config" single-tenant choice. The body-size cap stays on
// the route in every quadrant (it is route-level, not part of the auth middleware).
//
// Pipeline: SyncStore (WI-8b) → these routes → JSON the client's WI-2 guards (isPullResult /
// isPushResult) accept. The store is the untrusted-input validator: it THROWS on a malformed op, and
// this layer catches that throw → 400. A catch-all `onError` maps any unexpected error → 500 with a
// generic body so no stack trace or token ever reaches the wire.
//
// Security: the bearer token is compared in constant time (SHA-256 digest equality via
// crypto.timingSafeEqual) so neither the token's value NOR its length leaks through timing — a plain
// length-check-then-compare would reveal length, and timingSafeEqual itself throws on unequal-length
// buffers, so we hash both sides to a fixed 32-byte digest first.

import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { InvalidOpError, type SyncStore } from './db.js'
import { isAllowedUpstream, normalizeUpstream } from './proxy.js'
import type { PushOp } from './types.js'

export interface AppDeps {
  store: SyncStore
  token: string
  /**
   * Cap (in bytes) on the POST /sync/changes request body. A push is normally a few KB, so this is a
   * resource-exhaustion guard, not a functional limit. Omit to use the 5 MB default. An over-cap body
   * is rejected with 413 BEFORE the store sees it; the client maps 4xx → badRequest (a non-retryable
   * client error), which is correct — a body that big is a client bug, not a transient server fault.
   */
  maxBodyBytes?: number
  /**
   * Absolute (or cwd-relative) path to the built web-app `dist/` to serve at the same origin (#15 WI-4),
   * so any device loads the app AND calls `/config` + `/sync` from one origin — no CORS, no URL to type.
   * Omit for an API-only server (the pre-#15 behavior). When set together with an EMPTY token it also
   * AUTHORIZES the token-free /sync mode (#19 WI-1): origin + the Tailscale ACL is the boundary. The
   * entry (index.ts) `stat`-validates this dir is a real readable directory before allowing that mode.
   */
  staticDir?: string
  /**
   * The operator's `PROXY_ALLOWED_UPSTREAMS` allow-list (#28), already parsed + normalized by the entry
   * (index.ts → `parseAllowedUpstreams`). Bounds the same-origin LLM proxy's destination set to
   * operator-named full base URLs. Omit / empty → the proxy is DISABLED (`POST /proxy` 403s and
   * `GET /proxy` advertises `[]`, so the client stays direct-by-default).
   */
  allowedUpstreams?: string[]
}

const BEARER_PREFIX = 'Bearer '

/** Default request-body cap: 5 MiB. Tiny next to a normal push, large enough to never bite real use. */
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024

/** PUT /config body cap: 64 KiB. An encrypted config blob is a few KB; this is a resource guard (#15). */
const CONFIG_MAX_BODY_BYTES = 64 * 1024

/** Fixed-length SHA-256 digest of a string — lets timingSafeEqual run on equal-length buffers. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * Constant-time bearer-token check. Comparing SHA-256 digests (always 32 bytes) means timingSafeEqual
 * never sees unequal-length inputs (it throws on those) AND the comparison time does not depend on the
 * presented token's length — so a wrong-length token is rejected without leaking that it was the wrong
 * length. A digest collision would be required to bypass; that is the SHA-256 security assumption.
 */
function tokenMatches(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected))
}

/** A non-negative safe integer parsed from a query string (mirrors the store's wire guard). */
function parseSince(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  // Reject anything that is not a pure base-10 non-negative integer literal: this rules out 'abc',
  // '-1', '1.5', '0x1', '1e3', leading/trailing junk, and whitespace before Number() coercion lies.
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  // The digits-only regex already guarantees non-negative, so only the safe-integer bound remains
  // (an all-digits value above Number.MAX_SAFE_INTEGER → null → 400).
  return Number.isSafeInteger(n) ? n : null
}

/** Type-only guard: the parsed JSON body is an array (the store re-validates each op's shape). */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/** A plain (non-array) JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Non-negative safe integer (the parsed-JSON form of the wire guard); narrows to `number`. */
function isNonNegInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function createApp(deps: AppDeps): Hono {
  // The SINGLE shared token-free predicate (#19 WI-1): a staticDir is set AND the token is empty (or
  // whitespace-only). Computed ONCE and used for BOTH the startup-throw skip AND the /sync middleware
  // choice below, so the two can never drift into an inconsistent state. See the four-quadrant table
  // in the file header.
  const tokenFree = deps.staticDir !== undefined && deps.token.trim().length === 0

  // Defense-in-depth: an empty/whitespace token would let a bare `Bearer ` header authenticate
  // (digest('') === digest('')). API-only with no auth is a footgun — reject it. The ONLY exemption is
  // the token-free single-origin quadrant (staticDir set + empty token), where origin + the Tailscale
  // ACL is the boundary instead of a typed token.
  if (!tokenFree && deps.token.trim().length === 0) {
    throw new Error('createApp: a non-empty bearer token is required')
  }
  const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const app = new Hono()

  // 1. Auth scoped to the /sync routes ONLY (the plaintext workspace data). `/config` (#15) and the
  //    served web app (WI-4) are intentionally OUTSIDE this scope: `/config` stores only E2E ciphertext
  //    that is useless without the user's passphrase, the static app must load before any token could be
  //    entered, and the Tailscale network is the transport perimeter.
  //    - tokenFree → a PASS-THROUGH guard: every /sync request runs, and ANY Authorization header (e.g.
  //      a stale `Bearer x` from a prior token-mode session) is IGNORED, never rejected. (We must NOT
  //      use tokenMatches against the empty token — digest('') would reject every real bearer.)
  //    - else → the constant-time bearer guard: missing header / wrong scheme / wrong token → 401; the
  //      body never reveals the token's length or value.
  const guard: MiddlewareHandler = tokenFree
    ? async (_c, next) => {
        await next()
      }
    : async (c, next) => {
        const header = c.req.header('Authorization')
        if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
          return c.json({ error: 'unauthorized' }, 401)
        }
        const presented = header.slice(BEARER_PREFIX.length)
        if (!tokenMatches(presented, deps.token)) {
          return c.json({ error: 'unauthorized' }, 401)
        }
        await next()
      }
  app.use('/sync/*', guard)
  // #28: gate the LLM proxy (below) on the EXACT bare path. `/sync/*` matches `/proxy/<seg>` but NOT
  // bare `/proxy`, so copying that shape would leave the relay ungated — register the SAME tokenFree
  // guard on `/proxy` itself (Hono matches it exactly). A token-set single-origin server keeps /proxy
  // bearer-authed as defense, even though the client won't use the proxy path in that quadrant.
  app.use('/proxy', guard)

  // 2. GET /sync/changes?since=<int> → 200 PullResult, or 400 on a bad/absent cursor.
  app.get('/sync/changes', (c) => {
    const since = parseSince(c.req.query('since'))
    if (since === null) return c.json({ error: 'bad request' }, 400)
    return c.json(deps.store.changesSince(since))
  })

  // 3. POST /sync/changes (JSON PushOp[]) → 200 PushResult[]. The body-size cap runs FIRST (before any
  //    JSON parse or store access), so an over-cap body is rejected with 413 before consuming resources;
  //    nothing is persisted. Then: non-array body or invalid JSON → 400; a malformed op makes the store
  //    THROW → caught here → 400 (nothing is persisted: the store validates the whole batch before its
  //    transaction begins).
  app.post(
    '/sync/changes',
    bodyLimit({ maxSize: maxBodyBytes, onError: (c) => c.json({ error: 'payload too large' }, 413) }),
    async (c) => {
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: 'bad request' }, 400) // invalid / empty JSON
      }
      if (!isArray(body)) return c.json({ error: 'bad request' }, 400)
      try {
        // The cast is safe: the store re-validates every op (assertValidOp) and throws InvalidOpError on
        // any deviation, which the catch maps to 400 — untrusted JSON never bypasses validation.
        return c.json(deps.store.applyOps(body as PushOp[]))
      } catch (err) {
        // ONLY a malformed op is a 400; any other throw is an internal fault (e.g. a SQLite error) and
        // must surface as 500 (→ client 'unreachable', retryable) rather than be misread as a bad request.
        if (err instanceof InvalidOpError) return c.json({ error: 'bad request' }, 400)
        throw err
      }
    },
  )

  // 4. DELETE /sync/data → 204 (empty body).
  app.delete('/sync/data', (c) => {
    deps.store.purge()
    return c.body(null, 204)
  })

  // 5. GET /config → 200 { blob: <opaque ciphertext envelope> | null, rev }. rev 0 + blob null means
  //    "no config yet" (the client's first PUT uses baseRev 0). No auth (see middleware note).
  app.get('/config', (c) => {
    const cfg = deps.store.getConfig()
    if (cfg === null) return c.json({ blob: null, rev: 0 })
    return c.json({ blob: JSON.parse(cfg.blob), rev: cfg.rev })
  })

  // 6. PUT /config { blob: object, baseRev: int } → 200 { status:'applied', rev } on success, 409
  //    { status:'conflict', rev, blob } on a stale baseRev (the client re-pulls + retries). The blob is
  //    stored OPAQUELY (JSON.stringify'd; never inspected). Body capped at 64 KiB (over-cap → 413).
  app.put(
    '/config',
    bodyLimit({ maxSize: CONFIG_MAX_BODY_BYTES, onError: (c) => c.json({ error: 'payload too large' }, 413) }),
    async (c) => {
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: 'bad request' }, 400) // invalid / empty JSON
      }
      if (!isRecord(body) || !isRecord(body.blob) || !isNonNegInt(body.baseRev)) {
        return c.json({ error: 'bad request' }, 400)
      }
      const result = deps.store.putConfig(JSON.stringify(body.blob), body.baseRev)
      if (result.status === 'conflict') {
        return c.json({ status: 'conflict', rev: result.rev, blob: JSON.parse(result.blob) }, 409)
      }
      return c.json({ status: 'applied', rev: result.rev })
    },
  )

  // 7. #28 same-origin LLM proxy. `GET /proxy` advertises the operator allow-list (the client caches it
  //    once on connect); `POST /proxy` RELAYS the browser's chat/completions request to a LISTED custom
  //    endpoint the browser can't reach directly (CORS-less / mixed-content / private-IP). Auth-gated by
  //    the step-1 guard on the exact `/proxy` path. SSRF is bounded by the allow-list: the FIXED
  //    `/chat/completions` path is appended to a LISTED base URL (never a client path), `redirect:'error'`
  //    blocks a 3xx hop past the pre-fetch check, and ONLY content-type + the client Authorization (the
  //    custom provider's key) are forwarded — hop-by-hop + Host stripped — and NEVER logged (rule 65 §5).
  //    The body cap runs first. The upstream body streams straight back (SSE token-by-token, no buffer);
  //    an upstream throw (down, or a blocked redirect) → 502.
  const allowedUpstreams = deps.allowedUpstreams ?? []

  app.get('/proxy', (c) => c.json({ upstreams: allowedUpstreams }))

  app.post(
    '/proxy',
    bodyLimit({ maxSize: maxBodyBytes, onError: (c) => c.json({ error: 'payload too large' }, 413) }),
    async (c) => {
      const rawTarget = c.req.header('x-lucid-proxy-upstream') ?? ''
      if (!isAllowedUpstream(rawTarget, allowedUpstreams)) {
        return c.json({ error: 'forbidden upstream' }, 403) // no target echo
      }
      // isAllowedUpstream returned true ⇒ normalizeUpstream(rawTarget) is a non-null normalized base URL.
      const base = normalizeUpstream(rawTarget) as string
      // Forward ONLY content-type + the client Authorization; strip everything else (hop-by-hop + Host).
      const headers: Record<string, string> = {}
      const contentType = c.req.header('content-type')
      if (contentType !== undefined) headers['content-type'] = contentType
      const authorization = c.req.header('authorization')
      if (authorization !== undefined) headers['authorization'] = authorization
      let upstream: Response
      try {
        upstream = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: c.req.raw.body,
          duplex: 'half',
          redirect: 'error',
          signal: c.req.raw.signal,
        })
      } catch {
        return c.json({ error: 'upstream unreachable' }, 502) // upstream down OR a blocked 3xx redirect
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'content-type': upstream.headers.get('content-type') ?? 'text/event-stream' },
      })
    },
  )

  // 8. Serve the built web app at the same origin (#15 WI-4), if a static dir was provided. Mounted
  //    LAST so it never shadows the /sync + /config + /proxy API routes (which are registered above and
  //    return first); serveStatic passes through (next()) when no file matches, so an unknown non-API GET
  //    falls to Hono's 404. lucid is a single-screen app with no client-side router, so `/` serves
  //    index.html and no HTML5-history SPA fallback is needed. Public — auth is /sync + /proxy scoped.
  if (deps.staticDir !== undefined) {
    app.use('/*', serveStatic({ root: deps.staticDir, index: 'index.html' }))
  }

  // 9. Catch-all: any unexpected error → 500 with a generic body. Never echo a stack trace or token.
  app.onError((_err, c) => c.json({ error: 'internal error' }, 500))

  return app
}

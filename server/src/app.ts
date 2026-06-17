// Purpose: the Hono HTTP layer for the self-hosted sync server (#9, WI-8c). `createApp` builds the
// app from injected deps (the SQLite store + the expected bearer token) — it reads NO env (that is
// the WI-8d entry's job). It exposes the three routes the lucid web client (src/lib/sync/backend.ts)
// calls, behind a constant-time bearer-auth guard, and maps every failure to the status the client's
// status→error mapping expects: 401/403 → 'auth', other 4xx → 'badRequest', 5xx → 'unreachable'.
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
import { Hono } from 'hono'
import { InvalidOpError, type SyncStore } from './db.js'
import type { PushOp } from './types.js'

export interface AppDeps {
  store: SyncStore
  token: string
}

const BEARER_PREFIX = 'Bearer '

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
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/** Type-only guard: the parsed JSON body is an array (the store re-validates each op's shape). */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function createApp(deps: AppDeps): Hono {
  // Defense-in-depth: an empty/whitespace token would let a bare `Bearer ` header authenticate
  // (digest('') === digest('')). The WI-8d entry must supply a real token; reject the footgun here too.
  if (deps.token.trim().length === 0) throw new Error('createApp: a non-empty bearer token is required')
  const app = new Hono()

  // 1. Bearer-auth on ALL routes. Missing header / wrong scheme / wrong token → 401. The body never
  //    reveals whether the token was the right length or value.
  app.use('*', async (c, next) => {
    const header = c.req.header('Authorization')
    if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    const presented = header.slice(BEARER_PREFIX.length)
    if (!tokenMatches(presented, deps.token)) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    await next()
  })

  // 2. GET /sync/changes?since=<int> → 200 PullResult, or 400 on a bad/absent cursor.
  app.get('/sync/changes', (c) => {
    const since = parseSince(c.req.query('since'))
    if (since === null) return c.json({ error: 'bad request' }, 400)
    return c.json(deps.store.changesSince(since))
  })

  // 3. POST /sync/changes (JSON PushOp[]) → 200 PushResult[]. Non-array body or invalid JSON → 400;
  //    a malformed op makes the store THROW → caught here → 400 (nothing is persisted: the store
  //    validates the whole batch before its transaction begins).
  app.post('/sync/changes', async (c) => {
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
  })

  // 4. DELETE /sync/data → 204 (empty body).
  app.delete('/sync/data', (c) => {
    deps.store.purge()
    return c.body(null, 204)
  })

  // 5. Catch-all: any unexpected error → 500 with a generic body. Never echo a stack trace or token.
  app.onError((_err, c) => c.json({ error: 'internal error' }, 500))

  return app
}

// WI-8c — Hono HTTP layer for the self-hosted sync server (auth + /sync routes).
// Tests drive the app via Hono's `app.request()` helper (no real server/port) against a real
// in-`:memory:` SyncStore, fresh per test. Assertions target observable behavior: status codes,
// the JSON shapes the lucid web client contract (src/lib/sync/backend.ts) demands, and the
// status→error mapping (401/403 auth, other-4xx badRequest, 5xx unreachable) the client relies on.

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { createSyncStore } from './db.js'
import type { SyncStore } from './db.js'
import type { PushOp, PushResult, PullResult } from './types.js'

const TOKEN = 'super-secret-token'

let store: SyncStore
let app: ReturnType<typeof createApp>

beforeEach(() => {
  store = createSyncStore() // fresh :memory: DB per test → full isolation
  app = createApp({ store, token: TOKEN })
})

/** Authorized request helper — attaches the correct bearer header. */
function authed(path: string, init: RequestInit = {}): Response | Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

/** Build a well-formed push op. */
function op(overrides: Partial<PushOp> = {}): PushOp {
  return {
    type: 'term',
    id: 'id-1',
    payload: { value: 'hello' },
    updatedAt: 100,
    deletedAt: null,
    baseRev: 0,
    ...overrides,
  }
}

describe('/config (E2E-encrypted config blob — no auth, optimistic-concurrency)', () => {
  const blob = { v: 1, kdf: 'PBKDF2-SHA256', iterations: 600000, salt: 'AA', iv: 'BB', ciphertext: 'CC' }
  // unauthenticated requests — /config must be reachable WITHOUT a bearer token
  const put = (body: unknown) =>
    app.request('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  const get = () => app.request('/config')

  it('returns {blob:null, rev:0} when no config is stored yet', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ blob: null, rev: 0 })
  })

  it('round-trips: PUT (baseRev 0) then GET returns the opaque blob at rev 1', async () => {
    const p = await put({ blob, baseRev: 0 })
    expect(p.status).toBe(200)
    await expect(p.json()).resolves.toEqual({ status: 'applied', rev: 1 })
    await expect((await get()).json()).resolves.toEqual({ blob, rev: 1 })
  })

  it('updates at the current rev (baseRev 1 → rev 2)', async () => {
    await put({ blob, baseRev: 0 })
    const blob2 = { ...blob, ciphertext: 'DD' }
    await expect((await put({ blob: blob2, baseRev: 1 })).json()).resolves.toEqual({ status: 'applied', rev: 2 })
    await expect((await get()).json()).resolves.toEqual({ blob: blob2, rev: 2 })
  })

  it('rejects a stale baseRev with 409 + the authoritative blob (no clobber)', async () => {
    await put({ blob, baseRev: 0 }) // rev 1
    const blob2 = { ...blob, ciphertext: 'DD' }
    await put({ blob: blob2, baseRev: 1 }) // rev 2
    const stale = await put({ blob: { ...blob, ciphertext: 'EVIL' }, baseRev: 1 }) // still thinks rev is 1
    expect(stale.status).toBe(409)
    await expect(stale.json()).resolves.toEqual({ status: 'conflict', rev: 2, blob: blob2 })
    await expect((await get()).json()).resolves.toEqual({ blob: blob2, rev: 2 }) // stale write did NOT overwrite
  })

  it('first write applies at rev 1 regardless of baseRev (empty store ignores a stale/huge baseRev)', async () => {
    await expect((await put({ blob, baseRev: 999_999 })).json()).resolves.toEqual({ status: 'applied', rev: 1 })
  })

  it('requires NO bearer token (GET + PUT work unauthenticated)', async () => {
    expect((await get()).status).toBe(200)
    expect((await put({ blob, baseRev: 0 })).status).toBe(200)
  })

  it('still protects /sync with the bearer token (regression — auth scoped, not removed)', async () => {
    expect((await app.request('/sync/changes?since=0')).status).toBe(401)
  })

  it.each([
    ['a non-object body', JSON.stringify('nope')],
    ['a null blob', JSON.stringify({ blob: null, baseRev: 0 })],
    ['a missing blob', JSON.stringify({ baseRev: 0 })],
    ['a non-integer baseRev', JSON.stringify({ blob, baseRev: -1 })],
    ['invalid JSON', '{not json'],
  ])('rejects %s with 400', async (_label, raw) => {
    expect((await put(raw)).status).toBe(400)
  })

  it('rejects an over-cap (>64KB) body with 413 (nothing stored)', async () => {
    const res = await put({ blob: { ...blob, ciphertext: 'x'.repeat(70_000) }, baseRev: 0 })
    expect(res.status).toBe(413)
    await expect((await get()).json()).resolves.toEqual({ blob: null, rev: 0 })
  })
})

describe('static app serving (#15 WI-4 — single-origin)', () => {
  let dir: string
  let appWithStatic: ReturnType<typeof createApp>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lucid-static-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Lucid</title>')
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("hi")')
    appWithStatic = createApp({ store, token: TOKEN, staticDir: dir })
  })

  it('serves index.html at / without a token', async () => {
    const res = await appWithStatic.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<title>Lucid</title>')
  })

  it('serves a static asset', async () => {
    const res = await appWithStatic.request('/assets/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('console.log')
  })

  it('does NOT shadow the /config API route', async () => {
    const res = await appWithStatic.request('/config')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ blob: null, rev: 0 })
  })

  it('does NOT shadow /sync (still 401 without a token)', async () => {
    expect((await appWithStatic.request('/sync/changes?since=0')).status).toBe(401)
  })

  it('returns 404 for an unknown non-API path (single screen → no SPA history fallback)', async () => {
    expect((await appWithStatic.request('/no/such/file.txt')).status).toBe(404)
  })

  it('serves NO static content when staticDir is omitted (API-only, backward compat)', async () => {
    expect((await app.request('/')).status).toBe(404)
  })

  it('still serves the /config API (PUT) with a staticDir mounted (no mount-order regression)', async () => {
    const res = await appWithStatic.request('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob: { v: 1, ciphertext: 'CC' }, baseRev: 0 }),
    })
    expect(res.status).toBe(200)
  })

  // Security: traversal must never escape staticDir. The defense lives in @hono/node-server's
  // serveStatic; this pins it locally so a future dependency regression breaks the build, not prod.
  it.each([
    '/%2e%2e/%2e%2e/package.json',
    '/..%2f..%2fpackage.json',
    '/%2e%2e%2f%2e%2e%2fserver%2fpackage.json',
  ])('rejects path traversal %s with 404 (cannot read outside staticDir)', async (p) => {
    expect((await appWithStatic.request(p)).status).toBe(404)
  })
})

describe('bearer auth middleware', () => {
  it('rejects a request with no Authorization header → 401', async () => {
    const res = await app.request('/sync/changes?since=0')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('rejects the wrong auth scheme (Basic) → 401', async () => {
    const res = await app.request('/sync/changes?since=0', {
      headers: { Authorization: `Basic ${TOKEN}` },
    })
    expect(res.status).toBe(401)
  })

  it('rejects a wrong token of the SAME length → 401', async () => {
    const wrong = 'x'.repeat(TOKEN.length)
    const res = await app.request('/sync/changes?since=0', {
      headers: { Authorization: `Bearer ${wrong}` },
    })
    expect(res.status).toBe(401)
  })

  it('rejects a wrong token of a DIFFERENT length → 401, not a crash', async () => {
    const res = await app.request('/sync/changes?since=0', {
      headers: { Authorization: 'Bearer short' },
    })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('rejects an empty bearer token → 401', async () => {
    const res = await app.request('/sync/changes?since=0', {
      headers: { Authorization: 'Bearer ' },
    })
    expect(res.status).toBe(401)
  })

  it('lets the route run with the correct Bearer token', async () => {
    const res = await authed('/sync/changes?since=0')
    expect(res.status).toBe(200)
  })

  it('guards every route (POST without auth → 401)', async () => {
    const res = await app.request('/sync/changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([op()]),
    })
    expect(res.status).toBe(401)
  })

  it('guards DELETE without auth → 401', async () => {
    const res = await app.request('/sync/data', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })
})

describe('GET /sync/changes', () => {
  it('returns 200 + PullResult for ?since=0 on a seeded store', async () => {
    store.applyOps([op({ id: 'a' }), op({ id: 'b' })])
    const res = await authed('/sync/changes?since=0')
    expect(res.status).toBe(200)
    const body = (await res.json()) as PullResult
    expect(body.changes.map((c) => c.id).sort()).toEqual(['a', 'b'])
    expect(body.maxRev).toBe(2)
    for (const c of body.changes) expect(c.rev).toBeGreaterThanOrEqual(1)
  })

  it('returns an empty PullResult for an empty store at since=0', async () => {
    const res = await authed('/sync/changes?since=0')
    expect(res.status).toBe(200)
    const body = (await res.json()) as PullResult
    expect(body).toEqual({ changes: [], maxRev: 0 })
  })

  it('honors the since cursor (only rev > since)', async () => {
    store.applyOps([op({ id: 'a' })]) // rev 1
    store.applyOps([op({ id: 'b' })]) // rev 2
    const res = await authed('/sync/changes?since=1')
    const body = (await res.json()) as PullResult
    expect(body.changes.map((c) => c.id)).toEqual(['b'])
    expect(body.maxRev).toBe(2)
  })

  it('rejects a missing since param → 400', async () => {
    const res = await authed('/sync/changes')
    expect(res.status).toBe(400)
  })

  it('rejects a non-integer since (abc) → 400', async () => {
    const res = await authed('/sync/changes?since=abc')
    expect(res.status).toBe(400)
  })

  it('rejects a negative since (-1) → 400', async () => {
    const res = await authed('/sync/changes?since=-1')
    expect(res.status).toBe(400)
  })

  it('rejects a fractional since (1.5) → 400', async () => {
    const res = await authed('/sync/changes?since=1.5')
    expect(res.status).toBe(400)
  })

  it('rejects an empty since (?since=) → 400', async () => {
    const res = await authed('/sync/changes?since=')
    expect(res.status).toBe(400)
  })

  it('rejects a since above MAX_SAFE_INTEGER (all-digits but not a safe int) → 400', async () => {
    const res = await authed('/sync/changes?since=99999999999999999999')
    expect(res.status).toBe(400)
  })
})

describe('POST /sync/changes', () => {
  it('applies a valid PushOp[] → 200 + PushResult[]', async () => {
    const res = await authed('/sync/changes', {
      method: 'POST',
      body: JSON.stringify([op({ id: 'a' }), op({ id: 'b' })]),
    })
    expect(res.status).toBe(200)
    const results = (await res.json()) as PushResult[]
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'applied')).toBe(true)
    expect(results.map((r) => r.id).sort()).toEqual(['a', 'b'])
  })

  it('accepts an empty array → 200 + []', async () => {
    const res = await authed('/sync/changes', { method: 'POST', body: JSON.stringify([]) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([])
  })

  it('accepts a starred op (feature #22 — a new valid entity type, was 400) → 200 applied + pulls back', async () => {
    const res = await authed('/sync/changes', {
      method: 'POST',
      body: JSON.stringify([op({ id: 'st1', type: 'starred', payload: { kind: 'word', source: 'cat' } })]),
    })
    expect(res.status).toBe(200)
    const results = (await res.json()) as PushResult[]
    expect(results[0]).toMatchObject({ status: 'applied', id: 'st1' })
    const pulled = await authed('/sync/changes?since=0')
    const body = (await pulled.json()) as PullResult
    expect(body.changes.find((c) => c.id === 'st1')).toMatchObject({ type: 'starred', payload: { kind: 'word', source: 'cat' } })
  })

  it('rejects a body that is an object (not array) → 400', async () => {
    const res = await authed('/sync/changes', { method: 'POST', body: JSON.stringify({}) })
    expect(res.status).toBe(400)
  })

  it('rejects a body that is a string → 400', async () => {
    const res = await authed('/sync/changes', { method: 'POST', body: JSON.stringify('nope') })
    expect(res.status).toBe(400)
  })

  it('rejects a body that is a number → 400', async () => {
    const res = await authed('/sync/changes', { method: 'POST', body: JSON.stringify(42) })
    expect(res.status).toBe(400)
  })

  it('rejects invalid JSON → 400', async () => {
    const res = await authed('/sync/changes', { method: 'POST', body: 'not json{' })
    expect(res.status).toBe(400)
  })

  it('rejects a batch with a malformed op (updatedAt: -1) → 400 and persists nothing', async () => {
    const malformed = { ...op({ id: 'bad' }), updatedAt: -1 }
    const res = await authed('/sync/changes', {
      method: 'POST',
      body: JSON.stringify([malformed]),
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'bad request' })
    // A follow-up GET must show nothing was persisted (the store throws → batch atomic-rejected).
    const after = await authed('/sync/changes?since=0')
    const body = (await after.json()) as PullResult
    expect(body.changes).toHaveLength(0)
  })
})

describe('DELETE /sync/data', () => {
  it('returns 204 with an empty body and empties the store', async () => {
    store.applyOps([op({ id: 'a' }), op({ id: 'b' })])
    const res = await authed('/sync/data', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    const after = await authed('/sync/changes?since=0')
    const body = (await after.json()) as PullResult
    expect(body.changes).toHaveLength(0)
  })
})

describe('error hygiene', () => {
  it('never echoes the token in an auth-failure body', async () => {
    const res = await app.request('/sync/changes?since=0', {
      headers: { Authorization: `Bearer ${TOKEN}wrong` },
    })
    const text = await res.text()
    expect(text).not.toContain(TOKEN)
  })

  it('maps an unexpected store error to 500 without leaking a stack trace', async () => {
    const boom = new Error('internal boom with secret stack')
    const brokenStore: SyncStore = {
      applyOps: () => {
        throw boom
      },
      changesSince: () => {
        throw boom
      },
      purge: () => {
        throw boom
      },
      close: () => {},
      getConfig: () => {
        throw boom
      },
      putConfig: () => {
        throw boom
      },
    }
    const brokenApp = createApp({ store: brokenStore, token: TOKEN })
    const res = await brokenApp.request('/sync/changes?since=0', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('internal boom with secret stack')
    expect(text).not.toContain(TOKEN)
  })

  it('maps an INTERNAL store error on POST to 500 — NOT 400 (distinct from a malformed op)', async () => {
    // A VALID op reaches applyOps, but the store throws a plain Error (e.g. a SQLite disk/lock fault),
    // NOT an InvalidOpError. That must surface as 500 (client → retryable 'unreachable'), never 400.
    const brokenStore: SyncStore = {
      applyOps: () => {
        throw new Error('sqlite disk I/O error')
      },
      changesSince: () => ({ changes: [], maxRev: 0 }),
      purge: () => {},
      close: () => {},
      getConfig: () => null,
      putConfig: () => ({ status: 'applied', rev: 1 }),
    }
    const brokenApp = createApp({ store: brokenStore, token: TOKEN })
    const res = await brokenApp.request('/sync/changes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([op({ id: 'a' })]), // a well-formed op → not a malformed-op 400
    })
    expect(res.status).toBe(500)
  })
})

describe('createApp configuration', () => {
  it('throws if constructed with an empty or whitespace-only token (auth footgun)', () => {
    expect(() => createApp({ store, token: '' })).toThrow()
    expect(() => createApp({ store, token: '   ' })).toThrow()
  })
})

// Feature #19 WI-1 — token-free single-origin /sync. The four quadrants of (staticDir, token):
// the SINGLE shared predicate `tokenFree = staticDir set AND token empty/whitespace` decides BOTH
// the startup-throw skip AND the /sync middleware (pass-through vs bearer). Only that one quadrant is
// unauthenticated; every other quadrant keeps the bearer gate byte-for-byte.
describe('token-free single-origin /sync (#19 WI-1)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lucid-tokenfree-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Lucid</title>')
  })

  // QUADRANT 1: staticDir set + EMPTY token → token-free (the new mode).
  it('does NOT throw when token is empty but a staticDir is set (the single-origin token-free quadrant)', () => {
    expect(() => createApp({ store, token: '', staticDir: dir })).not.toThrow()
  })

  it('reaches GET /sync/changes WITHOUT any Authorization header → 200 (origin + tailnet is the boundary)', async () => {
    const tokenFreeApp = createApp({ store, token: '', staticDir: dir })
    const res = await tokenFreeApp.request('/sync/changes?since=0')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ changes: [], maxRev: 0 })
  })

  it('IGNORES a stale `Bearer x` header in token-free mode → still 200 (header not rejected)', async () => {
    const tokenFreeApp = createApp({ store, token: '', staticDir: dir })
    const res = await tokenFreeApp.request('/sync/changes?since=0', {
      headers: { Authorization: 'Bearer stale-token-from-a-prior-mode' },
    })
    expect(res.status).toBe(200)
  })

  it('serves a token-free POST /sync/changes (push) → 200', async () => {
    const tokenFreeApp = createApp({ store, token: '', staticDir: dir })
    const res = await tokenFreeApp.request('/sync/changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([op({ id: 'a' })]),
    })
    expect(res.status).toBe(200)
    const results = (await res.json()) as PushResult[]
    expect(results[0]?.status).toBe('applied')
  })

  it('keeps the body-size cap on the route in token-free mode (over-cap → 413)', async () => {
    const tokenFreeApp = createApp({ store, token: '', staticDir: dir, maxBodyBytes: 64 })
    const big = JSON.stringify([op({ id: 'x', payload: { value: 'y'.repeat(500) } })])
    const res = await tokenFreeApp.request('/sync/changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: big,
    })
    expect(res.status).toBe(413)
  })

  it('serves a token-free DELETE /sync/data (purge) → 204 (the erase path works without auth)', async () => {
    store.applyOps([op({ id: 'a' })])
    const tokenFreeApp = createApp({ store, token: '', staticDir: dir })
    const res = await tokenFreeApp.request('/sync/data', { method: 'DELETE' })
    expect(res.status).toBe(204)
    const after = await tokenFreeApp.request('/sync/changes?since=0')
    expect(((await after.json()) as PullResult).changes).toHaveLength(0)
  })

  // The whitespace-only token must collapse to the SAME quadrant as the empty token (H1 fix: one
  // shared `tokenFree` predicate that trims, never two predicates that could drift).
  it('treats a whitespace-only token + staticDir identically to empty (still token-free → 200)', async () => {
    const tokenFreeApp = createApp({ store, token: '   ', staticDir: dir })
    const res = await tokenFreeApp.request('/sync/changes?since=0')
    expect(res.status).toBe(200)
  })

  // QUADRANT 2 (NAMED REGRESSION): staticDir set + token SET → /sync STILL bearer-authed. A
  // single-origin server that ALSO wants a token must stay protected. This preserves the existing
  // 'does NOT shadow /sync (still 401 without a token)' regression above.
  it('quadrant-2 regression: staticDir set + a token SET → /sync still 401s a missing bearer', async () => {
    const protectedApp = createApp({ store, token: TOKEN, staticDir: dir })
    expect((await protectedApp.request('/sync/changes?since=0')).status).toBe(401)
  })

  it('quadrant-2: staticDir + token still lets the correct bearer through → 200', async () => {
    const protectedApp = createApp({ store, token: TOKEN, staticDir: dir })
    const res = await protectedApp.request('/sync/changes?since=0', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    expect(res.status).toBe(200)
  })

  // QUADRANT 3: NO staticDir + empty token → throw at startup (the footgun is preserved — an
  // API-only server with no auth must never start).
  it('quadrant-3: API-only (no staticDir) + empty token STILL throws at startup (footgun preserved)', () => {
    expect(() => createApp({ store, token: '' })).toThrow()
    expect(() => createApp({ store, token: '   ' })).toThrow()
  })
})

describe('request body-size limit', () => {
  // A tiny cap makes the boundary testable; a real push is a few KB, far under the 5 MB default.
  const SMALL_CAP = 64

  function cappedApp(maxBodyBytes: number): ReturnType<typeof createApp> {
    return createApp({ store, token: TOKEN, maxBodyBytes })
  }

  function postTo(
    capped: ReturnType<typeof createApp>,
    body: string,
  ): Response | Promise<Response> {
    return capped.request('/sync/changes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body,
    })
  }

  it('rejects a POST body larger than the cap → 413', async () => {
    const capped = cappedApp(SMALL_CAP)
    // One op with a long payload string easily exceeds 64 bytes once serialized.
    const big = JSON.stringify([op({ id: 'x', payload: { value: 'y'.repeat(500) } })])
    expect(big.length).toBeGreaterThan(SMALL_CAP)
    const res = await postTo(capped, big)
    expect(res.status).toBe(413)
  })

  it('lets a small POST body through → 200 (a normal push is tiny)', async () => {
    const capped = cappedApp(SMALL_CAP)
    const small = JSON.stringify([]) // 2 bytes, well under the cap
    expect(small.length).toBeLessThanOrEqual(SMALL_CAP)
    const res = await postTo(capped, small)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([])
  })

  it('persists nothing when an over-cap POST is rejected', async () => {
    const capped = cappedApp(SMALL_CAP)
    const big = JSON.stringify([op({ id: 'x', payload: { value: 'z'.repeat(500) } })])
    const res = await postTo(capped, big)
    expect(res.status).toBe(413)
    const after = await authed('/sync/changes?since=0')
    const body = (await after.json()) as PullResult
    expect(body.changes).toHaveLength(0)
  })

  it('applies a generous default cap when maxBodyBytes is omitted (a normal push works)', async () => {
    // No maxBodyBytes → the 5 MB default; a normal-sized push still applies.
    const res = await authed('/sync/changes', {
      method: 'POST',
      body: JSON.stringify([op({ id: 'a' })]),
    })
    expect(res.status).toBe(200)
    const results = (await res.json()) as PushResult[]
    expect(results[0]?.status).toBe('applied')
  })
})

// Feature #28 — the same-origin LLM proxy. A custom/local endpoint the browser can't reach directly
// (CORS-less, mixed-content, private-IP) is RELAYED server-side. `/proxy` is auth-gated on the EXACT
// bare path (not `/proxy/*`), bounded by the operator env allow-list, streams the upstream body back,
// forwards ONLY content-type + the client Authorization, uses redirect:'error' (SSRF), and 502s on an
// upstream throw. The upstream fetch is mocked via a stubbed global fetch (no real network).
const LISTED = 'http://100.80.151.31:8000/v1'

/** A ReadableStream SSE body (bytes) that closes — the mocked upstream's streamed response. */
function sseBody(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text))
      c.close()
    },
  })
}

describe('GET /proxy — capability advertisement (#28)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lucid-proxy-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html>')
  })

  it('advertises the operator allow-list (token-free single-origin → open)', async () => {
    const a = createApp({ store, token: '', staticDir: dir, allowedUpstreams: [LISTED] })
    const res = await a.request('/proxy')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ upstreams: [LISTED] })
  })

  it('advertises [] when no allow-list is configured (default → proxy disabled)', async () => {
    const a = createApp({ store, token: '', staticDir: dir })
    await expect((await a.request('/proxy')).json()).resolves.toEqual({ upstreams: [] })
  })

  it('is auth-gated in the token-set quadrant (401 without a bearer)', async () => {
    const a = createApp({ store, token: TOKEN, staticDir: dir, allowedUpstreams: [LISTED] })
    expect((await a.request('/proxy')).status).toBe(401)
  })

  it('lets the correct bearer read the allow-list in the token-set quadrant → 200', async () => {
    const a = createApp({ store, token: TOKEN, staticDir: dir, allowedUpstreams: [LISTED] })
    const res = await a.request('/proxy', { headers: { Authorization: `Bearer ${TOKEN}` } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ upstreams: [LISTED] })
  })
})

describe('POST /proxy — same-origin LLM relay (#28)', () => {
  let dir: string
  let tokenFreeApp: ReturnType<typeof createApp>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lucid-proxy-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html>')
    tokenFreeApp = createApp({ store, token: '', staticDir: dir, allowedUpstreams: [LISTED] })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function proxyPost(
    app_: ReturnType<typeof createApp>,
    headers: Record<string, string>,
    body: string,
  ): Response | Promise<Response> {
    return app_.request('/proxy', { method: 'POST', headers, body })
  }

  it('relays an allowed upstream and streams the mocked SSE body back', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(sseBody('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await proxyPost(
      tokenFreeApp,
      { 'content-type': 'application/json', 'x-lucid-proxy-upstream': LISTED, Authorization: 'Bearer sk-user' },
      JSON.stringify({ model: 'm', stream: true }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(await res.text()).toContain('data: {"choices"')
    // Appends the FIXED /chat/completions path to the LISTED base (never a client path).
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${LISTED}/chat/completions`)
    expect(init.method).toBe('POST')
  })

  it('forwards Retry-After from a proxied 429 so the client keeps its server-directed backoff (rule 65 §4)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(sseBody('data: x\n\n'), {
        status: 429,
        headers: { 'content-type': 'text/event-stream', 'retry-after': '30' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await proxyPost(
      tokenFreeApp,
      { 'content-type': 'application/json', 'x-lucid-proxy-upstream': LISTED },
      '{}',
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30') // preserved through the relay (the 200 path has none)
  })

  it('forwards ONLY content-type + the client Authorization (strips other/hop-by-hop headers)', async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody('data: x\n\n'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await proxyPost(
      tokenFreeApp,
      {
        'content-type': 'application/json',
        'x-lucid-proxy-upstream': LISTED,
        Authorization: 'Bearer sk-user',
        Connection: 'keep-alive',
        'x-evil': 'nope',
      },
      '{}',
    )
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer sk-user')
    expect(headers['content-type']).toBe('application/json')
    expect(headers['connection']).toBeUndefined()
    expect(headers['x-evil']).toBeUndefined()
    expect(headers['x-lucid-proxy-upstream']).toBeUndefined()
    expect(headers['host']).toBeUndefined()
  })

  it('relays with no forwarded content-type when the client sends none (omits the header)', async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody('data: x\n\n'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    // A stream body carries no auto content-type (unlike a string body), so the request reaches the
    // relay with an absent content-type header → the forwarded headers omit it.
    const res = await tokenFreeApp.request('/proxy', {
      method: 'POST',
      headers: { 'x-lucid-proxy-upstream': LISTED },
      body: sseBody('{}'),
      duplex: 'half',
    } as RequestInit)
    expect(res.status).toBe(200)
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
  })

  it('passes redirect:"error" and signal to the upstream fetch (no 3xx auto-follow — SSRF)', async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody('data: x\n\n'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await proxyPost(tokenFreeApp, { 'content-type': 'application/json', 'x-lucid-proxy-upstream': LISTED }, '{}')
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('maps an upstream redirect (fetch throws under redirect:error) to 502', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('unexpected redirect')
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await proxyPost(tokenFreeApp, { 'content-type': 'application/json', 'x-lucid-proxy-upstream': LISTED }, '{}')
    expect(res.status).toBe(502)
  })

  it('maps any upstream fetch throw (network unreachable) to 502', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await proxyPost(tokenFreeApp, { 'content-type': 'application/json', 'x-lucid-proxy-upstream': LISTED }, '{}')
    expect(res.status).toBe(502)
  })

  it('403s an upstream NOT on the allow-list (no target echo) — never fetches', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await proxyPost(
      tokenFreeApp,
      { 'content-type': 'application/json', 'x-lucid-proxy-upstream': 'http://evil.internal/v1' },
      '{}',
    )
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('evil.internal')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('403s a missing x-lucid-proxy-upstream header — never fetches', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await proxyPost(tokenFreeApp, { 'content-type': 'application/json' }, '{}')
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('403s every POST when the allow-list is empty (proxy disabled) — never fetches', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const emptyApp = createApp({ store, token: '', staticDir: dir })
    const res = await proxyPost(emptyApp, { 'content-type': 'application/json', 'x-lucid-proxy-upstream': LISTED }, '{}')
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enforces the body-size cap (over-cap → 413) before relaying — never fetches', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const capped = createApp({ store, token: '', staticDir: dir, allowedUpstreams: [LISTED], maxBodyBytes: 16 })
    const big = JSON.stringify({ blob: 'x'.repeat(500) })
    const res = await proxyPost(capped, { 'content-type': 'application/json', 'x-lucid-proxy-upstream': LISTED }, big)
    expect(res.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is auth-gated on the EXACT bare /proxy path in the token-set quadrant (401 without a bearer)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const tokenApp = createApp({ store, token: TOKEN, staticDir: dir, allowedUpstreams: [LISTED] })
    const res = await proxyPost(tokenApp, { 'content-type': 'application/json', 'x-lucid-proxy-upstream': LISTED }, '{}')
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('end-to-end round-trip', () => {
  it('POST creates → GET returns with server revs → restful baseRev applies, stale conflicts', async () => {
    // 1. POST creates two entities.
    const create = await authed('/sync/changes', {
      method: 'POST',
      body: JSON.stringify([op({ id: 'a' }), op({ id: 'b' })]),
    })
    const created = (await create.json()) as PushResult[]
    expect(created.every((r) => r.status === 'applied')).toBe(true)

    // 2. GET returns them with server-assigned revs ≥ 1.
    const pulled = await authed('/sync/changes?since=0')
    const pull = (await pulled.json()) as PullResult
    const entityA = pull.changes.find((c) => c.id === 'a')
    expect(entityA).toBeDefined()
    expect(entityA?.rev).toBeGreaterThanOrEqual(1)
    const revA = entityA?.rev ?? 0

    // 3. A second POST at the correct baseRev applies.
    const update = await authed('/sync/changes', {
      method: 'POST',
      body: JSON.stringify([op({ id: 'a', baseRev: revA, payload: { value: 'updated' } })]),
    })
    const updated = (await update.json()) as PushResult[]
    expect(updated[0]?.status).toBe('applied')

    // 4. A POST at a stale baseRev conflicts and carries the authoritative server entity.
    const stale = await authed('/sync/changes', {
      method: 'POST',
      body: JSON.stringify([op({ id: 'a', baseRev: revA, payload: { value: 'stale' } })]),
    })
    const staleResults = (await stale.json()) as PushResult[]
    expect(staleResults[0]?.status).toBe('conflict')
    if (staleResults[0]?.status === 'conflict') {
      expect(staleResults[0].server.id).toBe('a')
      expect(staleResults[0].server.payload).toEqual({ value: 'updated' })
    }
  })
})

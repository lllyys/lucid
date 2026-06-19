// WI-8c — Hono HTTP layer for the self-hosted sync server (auth + /sync routes).
// Tests drive the app via Hono's `app.request()` helper (no real server/port) against a real
// in-`:memory:` SyncStore, fresh per test. Assertions target observable behavior: status codes,
// the JSON shapes the lucid web client contract (src/lib/sync/backend.ts) demands, and the
// status→error mapping (401/403 auth, other-4xx badRequest, 5xx unreachable) the client relies on.

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
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

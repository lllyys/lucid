// WI-8c — Hono HTTP layer for the self-hosted sync server (auth + /sync routes).
// Tests drive the app via Hono's `app.request()` helper (no real server/port) against a real
// in-`:memory:` SyncStore, fresh per test. Assertions target observable behavior: status codes,
// the JSON shapes the lucid web client contract (src/lib/sync/backend.ts) demands, and the
// status→error mapping (401/403 auth, other-4xx badRequest, 5xx unreachable) the client relies on.

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

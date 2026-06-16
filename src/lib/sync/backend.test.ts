import { describe, it, expect, vi } from 'vitest'
import { createRestSyncBackend } from './backend'
import type { PushOp, SyncEntity } from './types'

const entity: SyncEntity = { type: 'term', id: 'a', payload: { label: 'x' }, updatedAt: 5, deletedAt: null, rev: 3 }
const op: PushOp = { type: 'term', id: 'a', payload: { label: 'x' }, updatedAt: 5, deletedAt: null, baseRev: 0 }

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const make = (fetchMock: typeof fetch, timeoutMs = 15_000) =>
  createRestSyncBackend({ baseUrl: 'https://lucid.myserver.dev/', token: 'tok-123', fetch: fetchMock, timeoutMs })

describe('createRestSyncBackend — requests', () => {
  it('pull GETs /sync/changes?since=N with a bearer header + abort signal, and validates the body', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ changes: [entity], maxRev: 3 }))) as unknown as typeof fetch
    const res = await make(fetchMock).pull(7)
    expect(res).toEqual({ ok: true, value: { changes: [entity], maxRev: 3 } })
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://lucid.myserver.dev/sync/changes?since=7') // trailing slash trimmed
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('push POSTs the ops to /sync/changes and validates the PushResult[]', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse([{ status: 'applied', id: 'a', rev: 4 }])),
    ) as unknown as typeof fetch
    const res = await make(fetchMock).push([op])
    expect(res).toEqual({ ok: true, value: [{ status: 'applied', id: 'a', rev: 4 }] })
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://lucid.myserver.dev/sync/changes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual([op])
  })

  it('purge DELETEs /sync/data and returns ok', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch
    const res = await make(fetchMock).purge()
    expect(res).toEqual({ ok: true, value: undefined })
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://lucid.myserver.dev/sync/data')
    expect(init.method).toBe('DELETE')
  })
})

describe('createRestSyncBackend — error mapping', () => {
  it('maps 401/403 to a syncError auth', async () => {
    for (const status of [401, 403]) {
      const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, status))) as unknown as typeof fetch
      const res = await make(fetchMock).pull(0)
      expect(res).toEqual({ ok: false, error: { kind: 'auth' } })
    }
  })

  it('maps 5xx to unreachable', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, 503))) as unknown as typeof fetch
    expect(await make(fetchMock).pull(0)).toMatchObject({ ok: false, error: { kind: 'unreachable' } })
  })

  it('maps a non-auth 4xx to badRequest', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, 400))) as unknown as typeof fetch
    expect(await make(fetchMock).pull(0)).toMatchObject({ ok: false, error: { kind: 'badRequest' } })
  })

  it('maps a network throw to unreachable', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    expect(await make(fetchMock).pull(0)).toMatchObject({ ok: false, error: { kind: 'unreachable' } })
  })

  it('maps a malformed (schema-invalid) 2xx body to badRequest', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ changes: 'nope', maxRev: 0 }))) as unknown as typeof fetch
    expect(await make(fetchMock).pull(0)).toMatchObject({ ok: false, error: { kind: 'badRequest' } })
  })

  it('maps an unparseable (non-JSON) 2xx body to badRequest', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response('not json{', { status: 200, headers: { 'content-type': 'application/json' } })),
    ) as unknown as typeof fetch
    expect(await make(fetchMock).pull(0)).toMatchObject({ ok: false, error: { kind: 'badRequest' } })
  })

  it('falls back to the global fetch + default timeout when none are injected', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ changes: [], maxRev: 0 })))
    vi.stubGlobal('fetch', fetchMock)
    const backend = createRestSyncBackend({ baseUrl: 'https://x.dev', token: 't' }) // no fetch, no timeoutMs
    expect(await backend.pull(0)).toEqual({ ok: true, value: { changes: [], maxRev: 0 } })
    expect(fetchMock).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('maps a push body that is not a PushResult[] to badRequest', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ not: 'an array' }))) as unknown as typeof fetch
    expect(await make(fetchMock).push([op])).toMatchObject({ ok: false, error: { kind: 'badRequest' } })
  })

  it('maps a non-serializable push payload (BigInt) to badRequest instead of throwing', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([]))) as unknown as typeof fetch
    const res = await make(fetchMock).push([{ ...op, payload: { n: BigInt(1) } }])
    expect(res).toMatchObject({ ok: false, error: { kind: 'badRequest' } })
    expect(fetchMock).not.toHaveBeenCalled() // failed before the request
  })

  it('rejects a push response that is not one result per op (count mismatch)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([]))) as unknown as typeof fetch // 0 results for 1 op
    expect(await make(fetchMock).push([op])).toMatchObject({ ok: false, error: { kind: 'badRequest' } })
  })

  it('rejects a push response whose result id does not match the pushed op', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse([{ status: 'applied', id: 'WRONG', rev: 4 }])),
    ) as unknown as typeof fetch
    expect(await make(fetchMock).push([op])).toMatchObject({ ok: false, error: { kind: 'badRequest' } })
  })

  it('aborts on timeout (header phase) and maps it to unreachable', async () => {
    vi.useFakeTimers()
    // fetch that only rejects when its abort signal fires (simulating a hung server)
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    ) as unknown as typeof fetch
    const resP = make(fetchMock, 50).pull(0)
    await vi.advanceTimersByTimeAsync(60)
    expect(await resP).toMatchObject({ ok: false, error: { kind: 'unreachable' } })
    vi.useRealTimers()
  })

  it('bounds the body read too: a hang during res.json() aborts → unreachable', async () => {
    vi.useFakeTimers()
    // headers resolve, but the body read only settles when the abort signal fires
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')))),
      } as unknown as Response),
    ) as unknown as typeof fetch
    const resP = make(fetchMock, 50).pull(0)
    await vi.advanceTimersByTimeAsync(60)
    expect(await resP).toMatchObject({ ok: false, error: { kind: 'unreachable' } })
    vi.useRealTimers()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchStream, readSSE, ProviderHttpError } from './stream'
import { asyncChunks, bytes, streamResponse, stallingResponse } from '@/test/providerTestUtils'

async function readSSEAll(chunks: Array<string | Uint8Array>): Promise<string[]> {
  const out: string[] = []
  for await (const payload of readSSE(asyncChunks(chunks))) out.push(payload)
  return out
}

async function drain(gen: AsyncIterable<Uint8Array>): Promise<string> {
  const dec = new TextDecoder()
  let s = ''
  for await (const c of gen) s += dec.decode(c, { stream: true })
  return s + dec.decode()
}

describe('readSSE — event framing', () => {
  it('yields a single data event', async () => {
    expect(await readSSEAll(['data: hello\n\n'])).toEqual(['hello'])
  })
  it('joins multiple data: fields in one event with \\n', async () => {
    expect(await readSSEAll(['data: a\ndata: b\n\n'])).toEqual(['a\nb'])
  })
  it('reassembles an event split across two reads', async () => {
    expect(await readSSEAll(['data: hello\n', '\ndata: world\n\n'])).toEqual(['hello', 'world'])
  })
  it('reassembles a JSON payload split across two reads', async () => {
    expect(await readSSEAll(['data: {"a":', '1}\n\n'])).toEqual(['{"a":1}'])
  })
  it('reassembles a multi-byte char split across two reads (mid-UTF-8)', async () => {
    const c1 = new Uint8Array([...bytes('data: '), 0xc3]) // 'é' = 0xC3 0xA9
    const c2 = new Uint8Array([0xa9, ...bytes('\n\n')])
    expect(await readSSEAll([c1, c2])).toEqual(['é'])
  })
  it('handles CRLF, CR-only, and mixed line endings', async () => {
    expect(await readSSEAll(['data: x\r\n\r\n'])).toEqual(['x'])
    expect(await readSSEAll(['data: a\rdata: b\r\r'])).toEqual(['a\nb'])
    expect(await readSSEAll(['data: m\n\r\n'])).toEqual(['m'])
  })
  it('does not split on a CRLF that arrives across two reads', async () => {
    expect(await readSSEAll(['data: one\r', '\ndata: two\n\n'])).toEqual(['one\ntwo'])
  })
  it('ignores comment-only and non-data events', async () => {
    expect(await readSSEAll([': heartbeat\n\n'])).toEqual([])
    expect(await readSSEAll(['event: ping\nid: 7\n\n'])).toEqual([])
  })
  it('extracts data from an event that also has event:/id: fields', async () => {
    expect(await readSSEAll(['event: message\ndata: {"t":1}\n\n'])).toEqual(['{"t":1}'])
  })
  it('ignores the OpenAI [DONE] sentinel', async () => {
    expect(await readSSEAll(['data: [DONE]\n\n'])).toEqual([])
  })
  it('flushes a trailing event not terminated by a blank line', async () => {
    expect(await readSSEAll(['data: tail'])).toEqual(['tail'])
  })
  it('drops a trailing non-data fragment at EOF', async () => {
    expect(await readSSEAll(['event: trailing-no-data'])).toEqual([])
  })
  it('yields nothing for empty / whitespace-only input', async () => {
    expect(await readSSEAll([''])).toEqual([])
    expect(await readSSEAll(['\n\n'])).toEqual([])
  })
})

describe('fetchStream', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('yields body byte chunks via an injected fetch', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(['foo', 'bar'])))
    expect(await drain(fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch }))).toBe('foobar')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('uses globalThis.fetch when none is injected', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(streamResponse(['baz']))))
    expect(await drain(fetchStream('u', {}))).toBe('baz')
  })

  it('passes a never-aborting signal through and completes (removes its listener)', async () => {
    const ac = new AbortController()
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(['ok'])))
    expect(
      await drain(fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch, signal: ac.signal })),
    ).toBe('ok')
  })

  it('throws ProviderHttpError on a non-2xx response (status + Retry-After + body)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(['rate limited'], { status: 429, headers: { 'retry-after': '2' } })),
    )
    let caught: unknown
    try {
      await drain(fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ProviderHttpError)
    const err = caught as ProviderHttpError
    expect(err.status).toBe(429)
    expect(err.retryAfter).toBe('2')
    expect(err.bodyText).toBe('rate limited')
  })

  it('falls back to an empty bodyText when reading the error body fails', async () => {
    const fakeRes = {
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: () => Promise.reject(new Error('body read failed')),
    } as unknown as Response
    const fetchMock = vi.fn(() => Promise.resolve(fakeRes))
    let caught: unknown
    try {
      await drain(fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ProviderHttpError)
    expect((caught as ProviderHttpError).status).toBe(500)
    expect((caught as ProviderHttpError).bodyText).toBe('')
  })

  it('returns without yielding when the response has no body', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })))
    expect(await drain(fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch }))).toBe('')
  })

  it('aborts a stalled body when the deadline fires (TimeoutError, not AbortError)', async () => {
    const fetchMock = vi.fn((_u: string, init: RequestInit) =>
      Promise.resolve(stallingResponse('data: hi\n\n', init.signal ?? undefined)),
    )
    await expect(drain(fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch, timeoutMs: 20 }))).rejects.toMatchObject({
      name: 'TimeoutError',
    })
  })

  it('forwards a caller abort (AbortError) through body consumption', async () => {
    const ac = new AbortController()
    const fetchMock = vi.fn((_u: string, init: RequestInit) =>
      Promise.resolve(stallingResponse('data: hi\n\n', init.signal ?? undefined)),
    )
    const it = fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch, signal: ac.signal })[
      Symbol.asyncIterator
    ]()
    const first = await it.next()
    expect(first.done).toBe(false)
    ac.abort()
    await expect(it.next()).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects immediately when the caller signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    const fetchMock = vi.fn((_u: string, init: RequestInit) =>
      init.signal?.aborted
        ? Promise.reject(new DOMException('aborted', 'AbortError'))
        : Promise.resolve(streamResponse(['x'])),
    )
    await expect(drain(fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch, signal: ac.signal }))).rejects.toMatchObject(
      { name: 'AbortError' },
    )
  })

  it('swallows a reader.cancel() rejection during early-return cleanup', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(bytes('chunk')) // never closes -> stream stays active
      },
      cancel() {
        return Promise.reject(new Error('cancel boom'))
      },
    })
    const fetchMock = vi.fn(() => Promise.resolve(new Response(body, { status: 200 })))
    const it = fetchStream('u', {}, { fetch: fetchMock as unknown as typeof fetch })[Symbol.asyncIterator]()
    await it.next() // 'chunk'
    await expect(it.return?.(undefined)).resolves.toMatchObject({ done: true })
  })
})

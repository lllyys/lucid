import { describe, it, expect, vi } from 'vitest'
import { openaiCompatibleStream } from './openaiCompatibleProvider'
import { collectStream } from './base'
import { streamResponse } from '@/test/providerTestUtils'
import type { LLMRequest, ProviderOutcome } from './types'

// Build OpenAI chat/completions SSE `data:` frames.
function sse(...events: (object | string)[]): string[] {
  return events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`)
}
const delta = (content: string) => ({ choices: [{ index: 0, delta: { content } }] })
const finish = (finish_reason: string) => ({ choices: [{ index: 0, delta: {}, finish_reason }] })
const DONE = '[DONE]'

const TRANSLATE: LLMRequest = { kind: 'translate', text: 'Hello world', targetLang: 'es' }

function run(
  frames: string[],
  opts: { status?: number; headers?: Record<string, string>; baseUrl?: string; reqOpts?: { model?: string; signal?: AbortSignal } } = {},
): { outcome: Promise<ProviderOutcome>; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn(() => Promise.resolve(streamResponse(frames, { status: opts.status, headers: opts.headers })))
  const streamFn = openaiCompatibleStream({
    apiKey: 'sk-test-key',
    baseUrl: opts.baseUrl ?? 'https://api.example.com/v1',
    fetch: fetchMock as unknown as typeof fetch,
  })
  const it = streamFn(TRANSLATE, { model: opts.reqOpts?.model ?? 'gpt-4o', signal: opts.reqOpts?.signal })
  return { outcome: collectStream(it, { signal: opts.reqOpts?.signal }), fetchMock }
}

describe('openaiCompatibleStream — happy path & request shape', () => {
  it('accumulates delta.content and completes on [DONE]', async () => {
    const { outcome } = run(sse(delta('Hola'), delta(' mundo'), finish('stop'), DONE))
    expect(await outcome).toEqual({ status: 'done', text: 'Hola mundo' })
  })

  it('POSTs to {baseUrl}/chat/completions with Bearer auth and the chat body', async () => {
    const { outcome, fetchMock } = run(sse(delta('hi'), finish('stop'), DONE))
    await outcome
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test-key')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ model: 'gpt-4o', stream: true })
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
  })

  it('omits the Authorization header for a keyless endpoint (empty apiKey — custom self-hosted)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(delta('hi'), finish('stop'), DONE))))
    const streamFn = openaiCompatibleStream({
      apiKey: '',
      baseUrl: 'https://my-host/v1',
      fetch: fetchMock as unknown as typeof fetch,
    })
    await collectStream(streamFn(TRANSLATE, { model: 'm' }))
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
    expect(headers['content-type']).toBe('application/json')
  })

  it('normalizes a trailing slash in baseUrl (no double slash)', async () => {
    const { outcome, fetchMock } = run(sse(delta('x'), DONE), { baseUrl: 'https://api.example.com/v1/' })
    await outcome
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.example.com/v1/chat/completions')
  })

  it('#28: POSTs to ${origin}/proxy with the upstream header when a proxy is configured (SSE identical)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(delta('hi'), finish('stop'), DONE))))
    const streamFn = openaiCompatibleStream({
      apiKey: 'sk-user-key',
      baseUrl: 'http://100.80.151.31:8000/v1',
      fetch: fetchMock as unknown as typeof fetch,
      proxy: { origin: 'https://app.example.com', upstream: 'http://100.80.151.31:8000/v1' },
    })
    const outcome = await collectStream(streamFn(TRANSLATE, { model: 'm' }))
    expect(outcome).toEqual({ status: 'done', text: 'hi' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    // routed to the same-origin proxy, NOT the direct endpoint
    expect(url).toBe('https://app.example.com/proxy')
    const headers = init.headers as Record<string, string>
    expect(headers['x-lucid-proxy-upstream']).toBe('http://100.80.151.31:8000/v1')
    // the custom key still rides as Authorization (the server forwards it upstream)
    expect(headers.authorization).toBe('Bearer sk-user-key')
  })

  it('#28: uses the DIRECT chat/completions endpoint when no proxy is set (no upstream header)', async () => {
    const { outcome, fetchMock } = run(sse(delta('x'), DONE), { baseUrl: 'http://100.80.151.31:8000/v1' })
    await outcome
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://100.80.151.31:8000/v1/chat/completions')
    expect((init.headers as Record<string, string>)['x-lucid-proxy-upstream']).toBeUndefined()
  })

  it('defaults the model to "" when unset and includes max_tokens when requested', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(delta('x'), DONE))))
    const fn = openaiCompatibleStream({ apiKey: 'k', baseUrl: 'https://x/v1', fetch: fetchMock as unknown as typeof fetch })
    await collectStream(fn(TRANSLATE, { maxOutputTokens: 100 })) // no model, with a token cap
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.model).toBe('')
    expect(body.max_tokens).toBe(100)
  })
})

describe('openaiCompatibleStream — SSE quirks', () => {
  it('skips a role-only first delta and a null content, yielding only real text', async () => {
    const { outcome } = run(sse({ choices: [{ delta: { role: 'assistant' } }] }, { choices: [{ delta: { content: null } }] }, delta('real'), finish('stop'), DONE))
    expect(await outcome).toEqual({ status: 'done', text: 'real' })
  })

  it('ignores a usage-only / empty-choices final chunk and terminates on [DONE]', async () => {
    const { outcome } = run(sse(delta('done text'), { choices: [], usage: { completion_tokens: 5 } }, DONE))
    expect(await outcome).toEqual({ status: 'done', text: 'done text' })
  })

  it('completes on finish_reason:stop even without an explicit [DONE]', async () => {
    const { outcome } = run(sse(delta('hi'), finish('stop')))
    expect(await outcome).toEqual({ status: 'done', text: 'hi' })
  })
})

describe('openaiCompatibleStream — error mapping', () => {
  it('finish_reason:length → incomplete (keeps partial text)', async () => {
    const { outcome } = run(sse(delta('partial'), finish('length'), DONE))
    const r = await outcome
    expect(r).toMatchObject({ status: 'error', text: 'partial', error: { kind: 'incomplete' } })
  })

  it('finish_reason:content_filter → refusal', async () => {
    const { outcome } = run(sse(finish('content_filter'), DONE))
    expect((await outcome as { error: { kind: string } }).error.kind).toBe('refusal')
  })

  it('an in-stream {error} object on HTTP 200 is mapped (401 code → invalidKey)', async () => {
    const { outcome } = run(sse({ error: { message: 'bad key', type: 'invalid_request_error', code: 401 } }))
    expect((await outcome as { error: { kind: string } }).error.kind).toBe('invalidKey')
  })

  it('an in-stream {error} with no numeric code → providerDown (with or without a type)', async () => {
    for (const err of [{ message: 'overloaded', type: 'server_error' }, { message: 'down, no type' }]) {
      const { outcome } = run(sse({ error: err }))
      expect((await outcome as { error: { kind: string } }).error.kind).toBe('providerDown')
    }
  })

  it('malformed SSE JSON → requestFailed', async () => {
    const { outcome } = run(sse('{not json'))
    expect((await outcome as { error: { kind: string } }).error.kind).toBe('requestFailed')
  })

  it('valid-JSON-but-non-object payload (number / null / array) → requestFailed', async () => {
    for (const bad of ['42', 'null', '[1,2]']) {
      const { outcome } = run(sse(bad))
      expect((await outcome as { error: { kind: string } }).error.kind, `payload ${bad}`).toBe('requestFailed')
    }
  })

  it('stream ends with no content, no finish, no [DONE] → incomplete', async () => {
    const { outcome } = run([': keepalive\n\n']) // only a comment, then EOF
    expect((await outcome as { error: { kind: string } }).error.kind).toBe('incomplete')
  })

  it('maps an HTTP error status (429 → rateLimited)', async () => {
    const { outcome } = run(sse(delta('x')), { status: 429 })
    expect((await outcome as { error: { kind: string } }).error.kind).toBe('rateLimited')
  })

  it('honors abort (cancelled, no further chunks)', async () => {
    const controller = new AbortController()
    controller.abort()
    const { outcome } = run(sse(delta('x'), DONE), { reqOpts: { signal: controller.signal } })
    expect((await outcome).status).toBe('cancelled')
  })
})

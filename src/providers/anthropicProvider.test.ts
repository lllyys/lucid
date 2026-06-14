import { describe, it, expect, vi } from 'vitest'
import { anthropicStream } from './anthropicProvider'
import { collectStream } from './base'
import { streamResponse } from '@/test/providerTestUtils'
import type { LLMRequest, ProviderOutcome } from './types'

// Build SSE `data:` frames from Anthropic event objects.
function sse(...events: object[]): string[] {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`)
}
const textDelta = (text: string) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
const thinkingDelta = (t: string) => ({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: t } })
const messageDelta = (stop_reason: string) => ({ type: 'message_delta', delta: { stop_reason }, usage: { output_tokens: 3 } })
const MESSAGE_STOP = { type: 'message_stop' }

const TRANSLATE: LLMRequest = { kind: 'translate', text: 'Hello world', targetLang: 'es' }

function run(
  frames: string[],
  opts: { status?: number; headers?: Record<string, string>; reqOpts?: { model?: string; maxOutputTokens?: number; signal?: AbortSignal } } = {},
): { outcome: Promise<ProviderOutcome>; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn(() => Promise.resolve(streamResponse(frames, { status: opts.status, headers: opts.headers })))
  const streamFn = anthropicStream({ apiKey: 'sk-test-key', fetch: fetchMock as unknown as typeof fetch })
  const it = streamFn(TRANSLATE, { ...opts.reqOpts }) // no model -> exercises the default
  return { outcome: collectStream(it, { signal: opts.reqOpts?.signal }), fetchMock }
}

describe('anthropicStream — happy path & request shape', () => {
  it('accumulates text_delta chunks and completes on message_stop', async () => {
    const { outcome } = run(sse(textDelta('Hola'), textDelta(' mundo'), messageDelta('end_turn'), MESSAGE_STOP))
    expect(await outcome).toEqual({ status: 'done', text: 'Hola mundo' })
  })

  it('sends the correct endpoint, headers, and request body (no thinking/temperature)', async () => {
    const { outcome, fetchMock } = run(sse(textDelta('hi'), MESSAGE_STOP))
    await outcome
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/messages')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-api-key']).toBe('sk-test-key')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('claude-fable-5')
    expect(body.stream).toBe(true)
    expect(typeof body.system).toBe('string')
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello world' }])
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('temperature')
  })

  it('ignores thinking_delta, message_start, content_block_start, and malformed/empty deltas', async () => {
    const { outcome } = run(
      sse(
        { type: 'message_start', message: {} },
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
        thinkingDelta('let me think'),
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta' } }, // text_delta with no text
        { type: 'content_block_start', index: 1, content_block: { type: 'text' } },
        textDelta('Answer'),
        { type: 'message_delta', delta: {}, usage: { output_tokens: 1 } }, // message_delta with no stop_reason
        messageDelta('end_turn'),
        MESSAGE_STOP,
      ),
    )
    expect(await outcome).toEqual({ status: 'done', text: 'Answer' })
  })

  it('derives, clamps, and falls back for max_tokens', async () => {
    const maxTokensFor = async (reqOpts?: { model?: string; maxOutputTokens?: number }): Promise<number> =>
      JSON.parse(((await runBody(sse(textDelta('x'), MESSAGE_STOP), reqOpts)) as RequestInit).body as string).max_tokens
    expect(await maxTokensFor()).toBe(128_000) // claude-fable-5 capability
    expect(await maxTokensFor({ maxOutputTokens: 256 })).toBe(256) // explicit, within range
    expect(await maxTokensFor({ maxOutputTokens: 1_000_000_000 })).toBe(128_000) // clamped to capability
    expect(await maxTokensFor({ maxOutputTokens: -5 })).toBe(1) // floored to a positive minimum
    expect(await maxTokensFor({ maxOutputTokens: Number.NaN })).toBe(128_000) // non-finite -> capability
    expect(await maxTokensFor({ model: 'mystery-model' })).toBe(8192) // no capability entry -> fallback
  })
})

async function runBody(frames: string[], reqOpts?: { model?: string; maxOutputTokens?: number }): Promise<RequestInit> {
  const { outcome, fetchMock } = run(frames, { reqOpts: { model: 'claude-fable-5', ...reqOpts } })
  await outcome
  return (fetchMock.mock.calls[0] as [string, RequestInit])[1]
}

describe('anthropicStream — completion & error mapping', () => {
  it('EOF without message_stop -> incomplete (partial text retained)', async () => {
    const { outcome } = run(sse(textDelta('partial')))
    const out = await outcome
    expect(out).toMatchObject({ status: 'error', text: 'partial' })
    if (out.status === 'error') expect(out.error.kind).toBe('incomplete')
  })

  it('stop_reason refusal with zero output -> refusal (fallbackable)', async () => {
    const { outcome } = run(sse(messageDelta('refusal'), MESSAGE_STOP))
    const out = await outcome
    if (out.status === 'error') {
      expect(out.error.kind).toBe('refusal')
      expect(out.error.fallbackable).toBe(true)
    } else throw new Error('expected error')
  })

  it('stop_reason refusal AFTER partial output -> refusal (not fallbackable)', async () => {
    const { outcome } = run(sse(textDelta('half'), messageDelta('refusal'), MESSAGE_STOP))
    const out = await outcome
    if (out.status === 'error') {
      expect(out.error.kind).toBe('refusal')
      expect(out.error.fallbackable).toBe(false)
    } else throw new Error('expected error')
  })

  it('stop_reason max_tokens -> incomplete', async () => {
    const { outcome } = run(sse(textDelta('cut'), messageDelta('max_tokens'), MESSAGE_STOP))
    const out = await outcome
    expect(out).toMatchObject({ status: 'error', text: 'cut' })
    if (out.status === 'error') expect(out.error.kind).toBe('incomplete')
  })

  it('mid-stream error event -> providerDown (before any delta; error with no type)', async () => {
    const { outcome } = run(sse({ type: 'error' })) // no `error` field -> generic stream error detail
    const out = await outcome
    if (out.status === 'error') expect(out.error.kind).toBe('providerDown')
    else throw new Error('expected error')
  })

  it('mid-stream error event -> providerDown (after partial deltas, partial retained)', async () => {
    const { outcome } = run(sse(textDelta('some'), { type: 'error', error: { type: 'overloaded_error' } }))
    const out = await outcome
    expect(out).toMatchObject({ status: 'error', text: 'some' })
    if (out.status === 'error') expect(out.error.kind).toBe('providerDown')
  })

  it.each([
    ['authentication_error', 'invalidKey'],
    ['permission_error', 'invalidKey'],
    ['invalid_request_error', 'requestFailed'],
    ['not_found_error', 'requestFailed'],
    ['rate_limit_error', 'rateLimited'],
    ['billing_error', 'requestFailed'],
    ['request_too_large', 'requestFailed'],
    ['timeout_error', 'timeout'],
    ['api_error', 'providerDown'],
    ['overloaded_error', 'providerDown'],
  ])('maps a streamed %s error to %s (not blindly providerDown)', async (errType, kind) => {
    const { outcome } = run(sse({ type: 'error', error: { type: errType } }))
    const out = await outcome
    if (out.status === 'error') expect(out.error.kind).toBe(kind)
    else throw new Error('expected error')
  })

  it('stop_reason model_context_window_exceeded -> incomplete (not a silent done)', async () => {
    const { outcome } = run(sse(textDelta('cut'), messageDelta('model_context_window_exceeded'), MESSAGE_STOP))
    const out = await outcome
    expect(out).toMatchObject({ status: 'error', text: 'cut' })
    if (out.status === 'error') expect(out.error.kind).toBe('incomplete')
  })

  it.each(['data: 123\n\n', 'data: null\n\n', 'data: []\n\n'])('non-object SSE payload (%j) -> requestFailed', async (frame) => {
    const { outcome } = run([frame])
    const out = await outcome
    if (out.status === 'error') expect(out.error.kind).toBe('requestFailed')
    else throw new Error('expected error')
  })

  it('an empty text_delta does not count as output (refusal stays fallbackable)', async () => {
    const emptyDelta = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '' } }
    const { outcome } = run(sse(emptyDelta, messageDelta('refusal'), MESSAGE_STOP))
    const out = await outcome
    expect(out).toMatchObject({ status: 'error', text: '' })
    if (out.status === 'error') {
      expect(out.error.kind).toBe('refusal')
      expect(out.error.fallbackable).toBe(true)
    }
  })

  it.each([
    [429, 'rateLimited'],
    [500, 'providerDown'],
    [504, 'timeout'],
    [401, 'invalidKey'],
  ])('HTTP %i -> %s', async (status, kind) => {
    const { outcome } = run(['error body'], { status })
    const out = await outcome
    if (out.status === 'error') expect(out.error.kind).toBe(kind)
    else throw new Error('expected error')
  })

  it('malformed SSE data JSON -> requestFailed (before any delta)', async () => {
    const { outcome } = run(['data: {not json\n\n'])
    const out = await outcome
    if (out.status === 'error') expect(out.error.kind).toBe('requestFailed')
    else throw new Error('expected error')
  })

  it('malformed SSE data JSON -> requestFailed (after partial deltas, partial retained)', async () => {
    const { outcome } = run([...sse(textDelta('keep')), 'data: {broken\n\n'])
    const out = await outcome
    expect(out).toMatchObject({ status: 'error', text: 'keep' })
    if (out.status === 'error') expect(out.error.kind).toBe('requestFailed')
  })

  it('a pre-aborted signal -> cancelled', async () => {
    const ac = new AbortController()
    ac.abort()
    const { outcome } = run(sse(textDelta('x'), MESSAGE_STOP), { reqOpts: { signal: ac.signal } })
    expect((await outcome).status).toBe('cancelled')
  })
})

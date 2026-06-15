import { describe, it, expect, vi } from 'vitest'
import { geminiStream, type GeminiDeps } from './geminiProvider'
import { ProviderException, type LLMRequest, type StreamChunk, type StreamOptions } from './types'
import { streamResponse, stallingResponse } from '@/test/providerTestUtils'

// One Gemini SSE event per `data:` line (no [DONE] sentinel — the stream just ends).
const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`)
const textEvent = (text: string, finishReason?: string) => ({
  candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }],
})
const REQ: LLMRequest = { kind: 'translate', text: 'Hello', targetLang: 'es' }

function run(deps: GeminiDeps, opts: Partial<StreamOptions> = {}) {
  const stream = geminiStream(deps)
  return stream(REQ, { model: 'gemini-3.5-flash', ...opts } as StreamOptions)
}
async function collect(it: AsyncIterable<StreamChunk>): Promise<string> {
  let out = ''
  for await (const c of it) out += c.text
  return out
}

describe('geminiStream', () => {
  it('streams text from candidates[].content.parts[].text and finishes cleanly on STOP', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse(textEvent('Hola'), textEvent(' mundo', 'STOP')))),
    )
    expect(await collect(run({ apiKey: 'AIzaTEST', fetch: fetchMock as unknown as typeof fetch }))).toBe('Hola mundo')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('builds the streamGenerateContent request: ?alt=sse URL, x-goog-api-key, contents + systemInstruction', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(textEvent('x', 'STOP')))))
    await collect(run({ apiKey: 'AIzaSECRET', fetch: fetchMock as unknown as typeof fetch }, { maxOutputTokens: 256 }))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse',
    )
    const headers = init.headers as Record<string, string>
    expect(headers['x-goog-api-key']).toBe('AIzaSECRET')
    expect(headers.authorization).toBeUndefined() // never both auth schemes (400 otherwise)
    const body = JSON.parse(init.body as string)
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: expect.any(String) }] }])
    expect(body.systemInstruction.parts[0].text).toEqual(expect.any(String))
    expect(body.generationConfig).toEqual({ maxOutputTokens: 256 })
  })

  it('omits generationConfig when no maxOutputTokens is requested', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(textEvent('x', 'STOP')))))
    await collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.generationConfig).toBeUndefined()
  })

  it('strips a leading models/ prefix so the URL never doubles it', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(textEvent('x', 'STOP')))))
    await collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }, { model: 'models/gemini-3.5-flash' }))
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0]
    expect(url).toContain('/models/gemini-3.5-flash:streamGenerateContent')
    expect(url).not.toContain('models/models/')
  })

  it('uses the default base URL but honors a custom baseUrl override', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(textEvent('x', 'STOP')))))
    await collect(run({ apiKey: 'AIzaT', baseUrl: 'https://proxy.example.com', fetch: fetchMock as unknown as typeof fetch }))
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://proxy.example.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse',
    )
  })

  it('skips empty / non-string text parts', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse(
          sse(
            { candidates: [{ content: { parts: [{ text: '' }, { text: 42 }, { text: 'Hola' }] } }] },
            textEvent('!', 'STOP'),
          ),
        ),
      ),
    )
    expect(await collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).toBe('Hola!')
  })

  it('passes CJK / emoji / mixed-script text through verbatim (rule 66 §3)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse(textEvent('你好，'), textEvent('世界 🌏 mixed', 'STOP')))),
    )
    expect(await collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).toBe('你好，世界 🌏 mixed')
  })

  it('handles a candidate chunk with no content/parts (e.g. role-only) without yielding', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse({ candidates: [{ content: {} }] }, textEvent('hi', 'STOP')))),
    )
    expect(await collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).toBe('hi')
  })

  it('maps finishReason MAX_TOKENS to an incomplete error (partial text kept by the store)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(textEvent('partial', 'MAX_TOKENS')))))
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'incomplete' },
    })
  })

  it('maps finishReason SAFETY to a refusal (fallbackable only when nothing was produced)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse({ candidates: [{ finishReason: 'SAFETY' }] }))))
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'refusal', fallbackable: true },
    })
  })

  it('maps RECITATION to a refusal too', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse(textEvent('cited', 'RECITATION')))),
    )
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'refusal', fallbackable: false }, // text was produced → not fallbackable
    })
  })

  it('maps a prompt-level blockReason to a refusal', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse({ promptFeedback: { blockReason: 'SAFETY' } }))),
    )
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'refusal' },
    })
  })

  it('maps an unknown non-STOP finishReason (OTHER) to incomplete', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(textEvent('x', 'OTHER')))))
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'incomplete' },
    })
  })

  it('treats a stream that ends with no finishReason as incomplete (cut off)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(textEvent('half')))))
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'incomplete' },
    })
  })

  it('maps an in-stream error object with a numeric code via errorFromStatus (401 → invalidKey)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse({ error: { code: 401, status: 'UNAUTHENTICATED', message: 'bad key' } }))),
    )
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'invalidKey' },
    })
  })

  it('maps an in-stream error object without a numeric code to providerDown (no key/message leaked)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse(sse({ error: { status: 'INTERNAL', message: 'AIzaSECRET leaked?' } }))),
    )
    let caught: ProviderException | undefined
    try {
      await collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))
    } catch (e) {
      caught = e as ProviderException
    }
    expect(caught).toBeInstanceOf(ProviderException)
    expect(caught?.providerError.kind).toBe('providerDown')
    expect(JSON.stringify(caught?.providerError)).not.toContain('AIzaSECRET')
  })

  it('falls back to an empty model id when options.model is undefined (factory normally supplies one)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse(textEvent('x', 'STOP')))))
    await collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }, { model: undefined }))
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/:streamGenerateContent?alt=sse',
    )
  })

  it('maps an in-stream error object with neither code nor status to providerDown (generic detail)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(sse({ error: { message: 'boom' } }))))
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'providerDown' },
    })
  })

  it('throws requestFailed on malformed SSE JSON', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(['data: {not json\n\n'])))
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'requestFailed' },
    })
  })

  it('throws requestFailed on a non-object SSE payload', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(['data: 42\n\n', 'data: [1,2]\n\n'])))
    await expect(collect(run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({
      providerError: { kind: 'requestFailed' },
    })
  })

  it('honors an abort mid-stream (the transport error propagates)', async () => {
    const ac = new AbortController()
    const fetchMock = vi.fn(() => Promise.resolve(stallingResponse('data: ' + JSON.stringify(textEvent('partial')) + '\n\n', ac.signal)))
    const it = run({ apiKey: 'AIzaT', fetch: fetchMock as unknown as typeof fetch }, { signal: ac.signal })
    const p = collect(it)
    ac.abort()
    await expect(p).rejects.toBeDefined()
  })
})

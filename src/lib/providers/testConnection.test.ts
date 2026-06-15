import { describe, it, expect, vi } from 'vitest'
import { probeProvider } from './testConnection'
import { createProvider } from '@/providers'
import { makeProviderError } from '@/providers/errors'
import { ProviderException, type LLMProvider, type ProviderError } from '@/providers/types'
import { streamResponse } from '@/test/providerTestUtils'
import type { RetryDeps } from '@/providers/retry'

const fakeDeps: RetryDeps = { sleep: async () => {}, random: () => 0.5 }

// Anthropic SSE: one text delta, then message_stop.
const anthropicOk = () =>
  streamResponse([
    `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'pong' } })}\n\n`,
    `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ])

function provider(fetchMock: ReturnType<typeof vi.fn>, vendor: 'anthropic' = 'anthropic') {
  return createProvider(vendor, { apiKey: 'sk-test', fetch: fetchMock as unknown as typeof fetch }, fakeDeps)
}

// A provider whose raw stream() rejects with a specific ProviderException on first read — lets us
// prove the probe's handling of an arbitrary mapped error WITHOUT going through the HTTP path.
function rejectingProvider(error: ProviderError): LLMProvider {
  return {
    vendor: 'anthropic',
    model: 'm',
    stream: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new ProviderException(error)) }) }),
  } as unknown as LLMProvider // the probe only calls stream(); the other methods are never reached
}

describe('probeProvider', () => {
  it('returns ok + measured latency on the first streamed byte (then releases the request)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(anthropicOk()))
    const now = vi.fn<() => number>().mockReturnValueOnce(1000).mockReturnValueOnce(1042)
    const res = await probeProvider(provider(fetchMock), { now })
    expect(res).toEqual({ ok: true, latencyMs: 42 })
    expect(fetchMock).toHaveBeenCalledOnce() // single attempt — uses stream(), not retry/fallback
  })

  it('reports ok even when the stream completes with zero chunks (connection works, no output)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse([`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`])),
    )
    const res = await probeProvider(provider(fetchMock), { now: () => 5 })
    expect(res).toEqual({ ok: true, latencyMs: 0 })
  })

  it('uses Date.now by default when no clock is injected (real, non-negative latency)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(anthropicOk()))
    const res = await probeProvider(provider(fetchMock))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it.each([
    { status: 401, kind: 'invalidKey' },
    { status: 403, kind: 'invalidKey' },
    { status: 429, kind: 'rateLimited' },
    { status: 500, kind: 'providerDown' },
    { status: 400, kind: 'requestFailed' },
  ])('maps HTTP $status to { ok:false, kind:$kind }', async ({ status, kind }) => {
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse([''], { status })))
    const res = await probeProvider(provider(fetchMock), { now: () => 0 })
    expect(res).toEqual({ ok: false, kind })
  })

  it('maps a timeout (deadline exceeded) to { ok:false, kind:"timeout" }', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new DOMException('timeout', 'TimeoutError')))
    const res = await probeProvider(provider(fetchMock), { now: () => 0, timeoutMs: 50 })
    expect(res).toEqual({ ok: false, kind: 'timeout' })
  })

  it('maps a user abort to { ok:false, kind:"aborted" }', async () => {
    const fetchMock = vi.fn(() => Promise.reject(Object.assign(new Error('stop'), { name: 'AbortError' })))
    const res = await probeProvider(provider(fetchMock), { now: () => 0 })
    expect(res).toEqual({ ok: false, kind: 'aborted' })
  })

  it('passes its own timeoutMs into stream() (stream has no default timeout)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(anthropicOk()))
    await probeProvider(provider(fetchMock), { now: () => 0, timeoutMs: 1234 })
    // fetchStream received the probe's timeout — it composes a deadline; we assert the call happened
    // with our fetch (the timeout itself is exercised by stream.test.ts).
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does NOT retry a retryable error — exactly one attempt even on 429/500 (raw stream(), not translate)', async () => {
    // The probe's defining property: a retryable status must NOT be retried (it would mask the true
    // connection state). On a retrying path (streamOp/translate) 429/500 would fire multiple fetches.
    for (const status of [429, 500]) {
      const fetchMock = vi.fn(() => Promise.resolve(streamResponse([''], { status })))
      await probeProvider(provider(fetchMock), { now: () => 0 })
      expect(fetchMock).toHaveBeenCalledOnce()
    }
  })

  it('drops the error detail — surfaces only the kind, never any diagnostic string (rule 65 §5)', async () => {
    // The secret lives in the mapped ProviderError.detail (and is NOT a key shape, so sanitizeDetail
    // leaves it intact) — proving the probe itself DROPS detail rather than relying on redaction.
    const secret = 'INTERNAL-DIAGNOSTIC-9f3a-trace'
    const res = await probeProvider(rejectingProvider(makeProviderError('invalidKey', { detail: secret })), {
      now: () => 0,
    })
    expect(res).toEqual({ ok: false, kind: 'invalidKey' })
    expect(JSON.stringify(res)).not.toContain('INTERNAL-DIAGNOSTIC')
  })

  it('maps an in-stream refusal (HTTP 200, stop_reason refusal) to { ok:false, kind:"refusal" }', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'refusal' } })}\n\n`,
          `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
        ]),
      ),
    )
    expect(await probeProvider(provider(fetchMock), { now: () => 0 })).toEqual({ ok: false, kind: 'refusal' })
  })

  it('maps an in-stream error event (HTTP 200, authentication_error) to { ok:false, kind:"invalidKey" }', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([`data: ${JSON.stringify({ type: 'error', error: { type: 'authentication_error' } })}\n\n`]),
      ),
    )
    expect(await probeProvider(provider(fetchMock), { now: () => 0 })).toEqual({ ok: false, kind: 'invalidKey' })
  })

  it('maps a truncated stream (HTTP 200, no message_stop, no text) to { ok:false, kind:"incomplete" }', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse([`data: ${JSON.stringify({ type: 'ping' })}\n\n`])),
    )
    expect(await probeProvider(provider(fetchMock), { now: () => 0 })).toEqual({ ok: false, kind: 'incomplete' })
  })

  it('clamps a backwards-moving clock so latency is never negative', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(anthropicOk()))
    const now = vi.fn<() => number>().mockReturnValueOnce(1042).mockReturnValueOnce(1000) // end < start
    expect(await probeProvider(provider(fetchMock), { now })).toEqual({ ok: true, latencyMs: 0 })
  })
})

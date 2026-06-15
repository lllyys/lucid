import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
import { createProvider } from '@/providers'
import { useTestConnection } from './useTestConnection'
import { useProviderStore } from '@/stores/providerStore'
import { ProviderException, type LLMProvider, type StreamChunk } from '@/providers/types'
import { makeProviderError } from '@/providers/errors'

const mockCreate = vi.mocked(createProvider)

function streamingProvider(): LLMProvider {
  async function* s(): AsyncIterable<StreamChunk> {
    yield { text: 'hi' }
  }
  return { vendor: 'anthropic', model: 'm', stream: () => s() } as unknown as LLMProvider
}
function rejectingProvider(err: unknown): LLMProvider {
  return {
    vendor: 'anthropic',
    model: 'm',
    stream: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(err) }) }),
  } as unknown as LLMProvider
}

beforeEach(() => {
  mockCreate.mockReset()
  useProviderStore.getState().reset()
})

describe('useTestConnection', () => {
  it('records ok + latency on a successful probe', async () => {
    useProviderStore.getState().setApiKey('sk-test') // anthropic active + keyed
    mockCreate.mockReturnValue(streamingProvider())
    const { result } = renderHook(() => useTestConnection())
    await act(async () => {
      await result.current.test('anthropic')
    })
    const r = useProviderStore.getState().testResults.anthropic
    expect(r.status).toBe('ok')
    expect(r.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('records a mapped fail when the probe errors', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(rejectingProvider(new ProviderException(makeProviderError('invalidKey'))))
    const { result } = renderHook(() => useTestConnection())
    await act(async () => {
      await result.current.test('anthropic')
    })
    expect(useProviderStore.getState().testResults.anthropic).toEqual({ status: 'fail', msgKey: 'error.invalidKey' })
  })

  it('pre-check: a remote vendor with no key fails without building a provider', async () => {
    const { result } = renderHook(() => useTestConnection())
    await act(async () => {
      await result.current.test('openai')
    })
    expect(useProviderStore.getState().testResults.openai).toEqual({ status: 'fail', msgKey: 'settings.testNeedKey' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('pre-check: custom with no base URL fails without building a provider', async () => {
    const { result } = renderHook(() => useTestConnection())
    await act(async () => {
      await result.current.test('custom')
    })
    expect(useProviderStore.getState().testResults.custom).toEqual({ status: 'fail', msgKey: 'settings.testNeedUrl' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('ollama probes without a key (local, no pre-check block)', async () => {
    mockCreate.mockReturnValue(streamingProvider())
    const { result } = renderHook(() => useTestConnection())
    await act(async () => {
      await result.current.test('ollama')
    })
    expect(useProviderStore.getState().testResults.ollama.status).toBe('ok')
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('maps a createProvider ProviderException throw to its mapped kind', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockImplementation(() => {
      throw new ProviderException(makeProviderError('requestFailed'))
    })
    const { result } = renderHook(() => useTestConnection())
    await act(async () => {
      await result.current.test('anthropic')
    })
    expect(useProviderStore.getState().testResults.anthropic).toEqual({ status: 'fail', msgKey: 'error.requestFailed' })
  })

  it('maps a NON-ProviderException createProvider throw to error.unknown', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockImplementation(() => {
      throw new Error('boom')
    })
    const { result } = renderHook(() => useTestConnection())
    await act(async () => {
      await result.current.test('anthropic')
    })
    expect(useProviderStore.getState().testResults.anthropic).toEqual({ status: 'fail', msgKey: 'error.unknown' })
  })
})

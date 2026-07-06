import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
import { createProvider } from '@/providers'
import { useTestConnection } from './useTestConnection'
import { useProviderStore } from '@/stores/providerStore'
import { useSyncStore } from '@/stores/syncStore'
import { setProxyAllowlist, clearProxyAllowlist } from '@/lib/providers/proxyAllowlist'
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
  useSyncStore.getState().reset()
  clearProxyAllowlist()
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

  describe('custom-id-aware path (#10 WI-2)', () => {
    it('probes a specific custom by its resolved key/model/baseUrl and records the result ON that custom', async () => {
      const id = useProviderStore
        .getState()
        .addCustomProvider({ label: 'L', baseUrl: 'https://c/v1', model: 'cm', key: 'sk-c' })
      mockCreate.mockReturnValue(streamingProvider())
      const { result } = renderHook(() => useTestConnection())
      await act(async () => {
        await result.current.test('custom', id)
      })
      expect(mockCreate).toHaveBeenCalledWith('custom', { apiKey: 'sk-c', model: 'cm', baseUrl: 'https://c/v1' })
      expect(useProviderStore.getState().customProviders[id].testResult.status).toBe('ok')
      // the per-Vendor testResults map is NOT touched for a custom-id probe
      expect(useProviderStore.getState().testResults.custom.status).toBe('idle')
    })

    it('probes a keyless custom (key optional — keyless self-hosted)', async () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'https://c/v1', model: 'cm' })
      mockCreate.mockReturnValue(streamingProvider())
      const { result } = renderHook(() => useTestConnection())
      await act(async () => {
        await result.current.test('custom', id)
      })
      expect(mockCreate).toHaveBeenCalledWith('custom', { apiKey: '', model: 'cm', baseUrl: 'https://c/v1' })
      expect(useProviderStore.getState().customProviders[id].testResult.status).toBe('ok')
    })

    it('a custom with no base URL fails (needUrl) on its own record without building a provider', async () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: '', model: 'cm' })
      const { result } = renderHook(() => useTestConnection())
      await act(async () => {
        await result.current.test('custom', id)
      })
      expect(useProviderStore.getState().customProviders[id].testResult).toEqual({
        status: 'fail',
        msgKey: 'settings.testNeedUrl',
      })
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('#28: injects proxy for a token-free single-origin, allow-listed custom provider', async () => {
      const id = useProviderStore
        .getState()
        .addCustomProvider({ label: 'L', baseUrl: 'http://100.80.151.31:8000/v1', model: 'cm', key: 'sk-c' })
      useSyncStore.setState({ config: { serverUrl: window.location.origin, token: '' } })
      setProxyAllowlist(['http://100.80.151.31:8000/v1'])
      mockCreate.mockReturnValue(streamingProvider())
      const { result } = renderHook(() => useTestConnection())
      await act(async () => {
        await result.current.test('custom', id)
      })
      expect(mockCreate).toHaveBeenCalledWith('custom', {
        apiKey: 'sk-c',
        model: 'cm',
        baseUrl: 'http://100.80.151.31:8000/v1',
        proxy: { origin: window.location.origin, upstream: 'http://100.80.151.31:8000/v1' },
      })
    })

    it('#28: stays DIRECT (no proxy) for an unlisted custom provider', async () => {
      const id = useProviderStore
        .getState()
        .addCustomProvider({ label: 'L', baseUrl: 'http://unlisted.internal/v1', model: 'cm', key: 'sk-c' })
      useSyncStore.setState({ config: { serverUrl: window.location.origin, token: '' } })
      setProxyAllowlist(['http://100.80.151.31:8000/v1'])
      mockCreate.mockReturnValue(streamingProvider())
      const { result } = renderHook(() => useTestConnection())
      await act(async () => {
        await result.current.test('custom', id)
      })
      expect(mockCreate).toHaveBeenCalledWith('custom', { apiKey: 'sk-c', model: 'cm', baseUrl: 'http://unlisted.internal/v1' })
    })

    it('an unknown/dangling custom id is a no-op (no crash, no provider built)', async () => {
      const { result } = renderHook(() => useTestConnection())
      await act(async () => {
        await result.current.test('custom', 'ghost')
      })
      expect(mockCreate).not.toHaveBeenCalled()
      expect(useProviderStore.getState().customProviders).toEqual({})
    })

    it('records a mapped fail on the custom record when the probe errors', async () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'https://c/v1', model: 'cm' })
      mockCreate.mockReturnValue(rejectingProvider(new ProviderException(makeProviderError('invalidKey'))))
      const { result } = renderHook(() => useTestConnection())
      await act(async () => {
        await result.current.test('custom', id)
      })
      expect(useProviderStore.getState().customProviders[id].testResult).toEqual({
        status: 'fail',
        msgKey: 'error.invalidKey',
      })
    })

    it('maps a createProvider throw to the custom record', async () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'https://c/v1', model: 'cm' })
      mockCreate.mockImplementation(() => {
        throw new ProviderException(makeProviderError('requestFailed'))
      })
      const { result } = renderHook(() => useTestConnection())
      await act(async () => {
        await result.current.test('custom', id)
      })
      expect(useProviderStore.getState().customProviders[id].testResult).toEqual({
        status: 'fail',
        msgKey: 'error.requestFailed',
      })
    })
  })
})

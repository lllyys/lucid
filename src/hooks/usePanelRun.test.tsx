import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
import { createProvider } from '@/providers'
import { usePanelRun } from './usePanelRun'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
import { useSyncStore } from '@/stores/syncStore'
import { setProxyAllowlist, clearProxyAllowlist } from '@/lib/providers/proxyAllowlist'
import {
  ProviderException,
  type LLMProvider,
  type LLMRequest,
  type ProviderOutcome,
  type StreamChunk,
} from '@/providers/types'
import { makeProviderError } from '@/providers/errors'

const req: LLMRequest = { kind: 'translate', text: 'Hi', targetLang: 'es' }
const mockCreate = vi.mocked(createProvider)
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

function okProvider(outcome: ProviderOutcome = { status: 'done', text: 'ok' }): LLMProvider {
  async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    yield { text: 'ok' }
    return outcome
  }
  return {
    vendor: 'anthropic',
    model: 'm',
    stream: () => streamOp(),
    streamOp: () => streamOp(),
    translate: async () => outcome,
    polish: async () => outcome,
  }
}

beforeEach(() => {
  mockCreate.mockReset()
  useProviderStore.getState().reset()
  useSyncStore.getState().reset()
  clearProxyAllowlist()
  useOperationStore.getState().reset('translate')
  useOperationStore.setState({ translate: { status: 'idle', startedAt: null, elapsedMs: null, runId: 0, isAuto: false } })
})

describe('usePanelRun', () => {
  it('fails the op (invalidKey) without building a provider when not ready', () => {
    const { result } = renderHook(() => usePanelRun())
    act(() => result.current.run('translate', req))
    const op = useOperationStore.getState().translate
    expect(op.status).toBe('error')
    if (op.status === 'error') expect(op.error.kind).toBe('invalidKey')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('maps a createProvider ProviderException to the op error', () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockImplementation(() => {
      throw new ProviderException(makeProviderError('requestFailed'))
    })
    const { result } = renderHook(() => usePanelRun())
    act(() => result.current.run('translate', req))
    const op = useOperationStore.getState().translate
    if (op.status === 'error') expect(op.error.kind).toBe('requestFailed')
  })

  it('maps a non-ProviderException throw to unknown', () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockImplementation(() => {
      throw new Error('boom')
    })
    const { result } = renderHook(() => usePanelRun())
    act(() => result.current.run('translate', req))
    const op = useOperationStore.getState().translate
    if (op.status === 'error') expect(op.error.kind).toBe('unknown')
  })

  it('runs the operation with the built provider on the happy path', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(okProvider())
    const { result } = renderHook(() => usePanelRun())
    await act(async () => {
      result.current.run('translate', req)
      await tick()
    })
    expect(useOperationStore.getState().translate.status).toBe('done')
    expect(mockCreate).toHaveBeenCalledWith('anthropic', expect.objectContaining({ apiKey: 'sk-test' }))
  })

  it('resolves the ACTIVE custom\'s own key/model/baseUrl into createProvider (#10 WI-2)', async () => {
    const s = useProviderStore.getState()
    const id = s.addCustomProvider({
      label: 'My host',
      baseUrl: 'https://my-host.example.com/v1',
      model: 'cm',
      key: 'sk-custom',
    })
    s.setVendor({ type: 'custom', id })
    expect(useProviderStore.getState().isReady()).toBe(true)
    mockCreate.mockReturnValue(okProvider())
    const { result } = renderHook(() => usePanelRun())
    await act(async () => {
      result.current.run('translate', req)
      await tick()
    })
    expect(mockCreate).toHaveBeenCalledWith('custom', {
      apiKey: 'sk-custom',
      model: 'cm',
      baseUrl: 'https://my-host.example.com/v1',
    })
  })

  it('does NOT leak the legacy top-level baseUrl/model into an active custom run (#10 WI-2)', async () => {
    const s = useProviderStore.getState()
    const id = s.addCustomProvider({ label: 'Host', baseUrl: 'https://right/v1', model: 'right-model' })
    s.setVendor({ type: 'custom', id })
    s.setBaseUrl('https://stale-legacy/v1') // legacy top-level slot — must be ignored for the run
    mockCreate.mockReturnValue(okProvider())
    const { result } = renderHook(() => usePanelRun())
    await act(async () => {
      result.current.run('translate', req)
      await tick()
    })
    expect(mockCreate).toHaveBeenCalledWith('custom', {
      apiKey: '',
      model: 'right-model',
      baseUrl: 'https://right/v1',
    })
  })

  it('#28: injects proxy for a token-free single-origin, allow-listed custom provider', async () => {
    const s = useProviderStore.getState()
    const id = s.addCustomProvider({ label: 'Local vLLM', baseUrl: 'http://100.80.151.31:8000/v1', model: 'cm', key: 'sk-c' })
    s.setVendor({ type: 'custom', id })
    useSyncStore.setState({ config: { serverUrl: window.location.origin, token: '' } }) // token-free single-origin
    setProxyAllowlist(['http://100.80.151.31:8000/v1'])
    mockCreate.mockReturnValue(okProvider())
    const { result } = renderHook(() => usePanelRun())
    await act(async () => {
      result.current.run('translate', req)
      await tick()
    })
    expect(mockCreate).toHaveBeenCalledWith('custom', {
      apiKey: 'sk-c',
      model: 'cm',
      baseUrl: 'http://100.80.151.31:8000/v1',
      proxy: { origin: window.location.origin, upstream: 'http://100.80.151.31:8000/v1' },
    })
  })

  it('#28: stays DIRECT (no proxy) for an unlisted custom provider even when single-origin', async () => {
    const s = useProviderStore.getState()
    const id = s.addCustomProvider({ label: 'Unlisted', baseUrl: 'http://unlisted.internal/v1', model: 'cm', key: 'sk-c' })
    s.setVendor({ type: 'custom', id })
    useSyncStore.setState({ config: { serverUrl: window.location.origin, token: '' } })
    setProxyAllowlist(['http://100.80.151.31:8000/v1']) // does not include the unlisted base URL
    mockCreate.mockReturnValue(okProvider())
    const { result } = renderHook(() => usePanelRun())
    await act(async () => {
      result.current.run('translate', req)
      await tick()
    })
    expect(mockCreate).toHaveBeenCalledWith('custom', { apiKey: 'sk-c', model: 'cm', baseUrl: 'http://unlisted.internal/v1' })
  })

  it('abort delegates to the operation store', () => {
    useOperationStore.setState({ translate: { status: 'streaming', text: 'x', startedAt: 1, elapsedMs: null, runId: 1, isAuto: false } })
    const { result } = renderHook(() => usePanelRun())
    act(() => result.current.abort('translate'))
    expect(useOperationStore.getState().translate.status).toBe('cancelled')
  })
})

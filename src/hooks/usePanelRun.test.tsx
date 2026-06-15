import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
import { createProvider } from '@/providers'
import { usePanelRun } from './usePanelRun'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
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
  useOperationStore.getState().reset('translate')
  useOperationStore.setState({ translate: { status: 'idle', startedAt: null, elapsedMs: null, runId: 0 } })
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

  it('threads the custom base URL into createProvider so an active custom provider can run (#5 WI-6a)', async () => {
    const s = useProviderStore.getState()
    s.setVendor('custom')
    s.setBaseUrl('https://my-host.example.com/v1')
    s.setModel('m', 'custom') // keyless, but ready (baseUrl + model)
    expect(useProviderStore.getState().isReady()).toBe(true)
    mockCreate.mockReturnValue(okProvider())
    const { result } = renderHook(() => usePanelRun())
    await act(async () => {
      result.current.run('translate', req)
      await tick()
    })
    expect(mockCreate).toHaveBeenCalledWith(
      'custom',
      expect.objectContaining({ baseUrl: 'https://my-host.example.com/v1', model: 'm' }),
    )
  })

  it('abort delegates to the operation store', () => {
    useOperationStore.setState({ translate: { status: 'streaming', text: 'x', startedAt: 1, elapsedMs: null, runId: 1 } })
    const { result } = renderHook(() => usePanelRun())
    act(() => result.current.abort('translate'))
    expect(useOperationStore.getState().translate.status).toBe('cancelled')
  })
})

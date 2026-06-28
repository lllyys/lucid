import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
import { createProvider } from '@/providers'
import { useWordLookup } from './useWordLookup'
import { useProviderStore } from '@/stores/providerStore'
import { useLookupStore } from '@/stores/lookupStore'
import {
  ProviderException,
  type LLMProvider,
  type ProviderOutcome,
  type StreamChunk,
} from '@/providers/types'
import { makeProviderError } from '@/providers/errors'

const mockCreate = vi.mocked(createProvider)
const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const PAYLOAD = {
  word: 'stutter',
  sentence: 'perceive stutter',
  sourceLang: 'en',
  targetLang: 'zh',
  owner: 'translateResult' as const,
}
const FULL = JSON.stringify({ word: 'stutter', ipa: '/x/', meaning: 'm', translations: ['卡顿'] })

function okProvider(outcome: ProviderOutcome = { status: 'done', text: FULL }): LLMProvider {
  async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    yield { text: FULL }
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
  useLookupStore.getState().close()
})

describe('useWordLookup', () => {
  it('maps a not-ready provider to the lookup error state without building a provider', () => {
    const { result } = renderHook(() => useWordLookup())
    act(() => result.current.lookup(PAYLOAD))
    const s = useLookupStore.getState()
    expect(s.status).toBe('error')
    expect(s.error?.kind).toBe('invalidKey')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('stamps the payload owner on the not-ready error so it opens in the clicked host', () => {
    // A stale owner from a prior host must not capture this error popover.
    useLookupStore.setState({ owner: 'polishResult' })
    const { result } = renderHook(() => useWordLookup())
    act(() => result.current.lookup({ ...PAYLOAD, owner: 'translateSource' }))
    const s = useLookupStore.getState()
    expect(s.status).toBe('error')
    expect(s.owner).toBe('translateSource')
  })

  it('maps a createProvider ProviderException to the lookup error', () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockImplementation(() => {
      throw new ProviderException(makeProviderError('requestFailed'))
    })
    const { result } = renderHook(() => useWordLookup())
    act(() => result.current.lookup(PAYLOAD))
    expect(useLookupStore.getState().error?.kind).toBe('requestFailed')
  })

  it('maps a non-ProviderException throw to unknown', () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockImplementation(() => {
      throw new Error('boom')
    })
    const { result } = renderHook(() => useWordLookup())
    act(() => result.current.lookup(PAYLOAD))
    expect(useLookupStore.getState().error?.kind).toBe('unknown')
  })

  it('runs the lookup with the built provider on the happy path', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(okProvider())
    const { result } = renderHook(() => useWordLookup())
    await act(async () => {
      result.current.lookup(PAYLOAD)
      await tick()
    })
    const s = useLookupStore.getState()
    expect(s.status).toBe('done')
    expect(s.open).toBe(true)
    expect(s.translations).toEqual(['卡顿'])
    expect(mockCreate).toHaveBeenCalledWith('anthropic', expect.objectContaining({ apiKey: 'sk-test' }))
  })

  it('maps a done-but-unparseable outcome to the error state', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(okProvider({ status: 'done', text: 'not json' }))
    // the stream still yields FULL but the terminal text is garbage → done-unparseable→error
    const garbage = (() => {
      async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
        yield { text: 'not json' }
        return { status: 'done', text: 'not json' }
      }
      const p: LLMProvider = {
        vendor: 'anthropic', model: 'm',
        stream: () => streamOp(), streamOp: () => streamOp(),
        translate: async () => ({ status: 'done', text: 'not json' }),
        polish: async () => ({ status: 'done', text: 'not json' }),
      }
      return p
    })()
    mockCreate.mockReturnValue(garbage)
    const { result } = renderHook(() => useWordLookup())
    await act(async () => {
      result.current.lookup(PAYLOAD)
      await tick()
    })
    expect(useLookupStore.getState().status).toBe('error')
  })

  it('exposes close() that dismisses the active lookup', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(okProvider())
    const { result } = renderHook(() => useWordLookup())
    await act(async () => {
      result.current.lookup(PAYLOAD)
      await tick()
    })
    expect(useLookupStore.getState().open).toBe(true)
    act(() => result.current.close())
    expect(useLookupStore.getState().open).toBe(false)
  })
})

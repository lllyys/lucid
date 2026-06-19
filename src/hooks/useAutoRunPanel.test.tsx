import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
import { useAutoRunPanel } from './useAutoRunPanel'
import { useAutoRunStore } from '@/stores/autoRunStore'
import { useProviderStore } from '@/stores/providerStore'

beforeEach(() => {
  useAutoRunStore.getState().reset()
  useProviderStore.getState().reset()
})

describe('useAutoRunPanel — toggle gating', () => {
  it('reflects the panel toggle from the store and reacts to provider readiness', () => {
    const { result, rerender } = renderHook(() => useAutoRunPanel('translate'))
    expect(result.current.enabled).toBe(false)
    expect(result.current.canEnable).toBe(false) // no key yet → not ready

    act(() => {
      useProviderStore.getState().setApiKey('sk-test')
    })
    rerender()
    expect(result.current.canEnable).toBe(true)
  })

  it('requestToggle on a local provider enables directly (no cost gate)', () => {
    act(() => {
      useProviderStore.getState().setVendor('ollama') // local — isReady once a model is set
    })
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    act(() => result.current.requestToggle(true))
    expect(useAutoRunStore.getState().enabled.translate).toBe(true)
    expect(result.current.costGateOpen).toBe(false)
  })

  it('requestToggle on a hosted provider (no prior ack) opens the cost gate instead of enabling', () => {
    act(() => useProviderStore.getState().setApiKey('sk-test')) // anthropic, hosted
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    act(() => result.current.requestToggle(true))
    expect(useAutoRunStore.getState().enabled.translate).toBe(false) // not yet enabled
    expect(result.current.costGateOpen).toBe(true)
  })

  it('confirmCost acknowledges the vendor and enables the panel', () => {
    act(() => useProviderStore.getState().setApiKey('sk-test'))
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    act(() => result.current.requestToggle(true))
    act(() => result.current.confirmCost())
    expect(useAutoRunStore.getState().costAck.anthropic).toBe(true)
    expect(useAutoRunStore.getState().enabled.translate).toBe(true)
    expect(result.current.costGateOpen).toBe(false)
  })

  it('a hosted provider already acked skips the cost gate on re-enable', () => {
    act(() => {
      useProviderStore.getState().setApiKey('sk-test')
      useAutoRunStore.getState().ackCost('anthropic')
    })
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    act(() => result.current.requestToggle(true))
    expect(useAutoRunStore.getState().enabled.translate).toBe(true)
    expect(result.current.costGateOpen).toBe(false)
  })

  it('requestToggle(false) turns the panel off without any gate', () => {
    act(() => {
      useProviderStore.getState().setApiKey('sk-test')
      useAutoRunStore.getState().ackCost('anthropic')
      useAutoRunStore.getState().setEnabled('translate', true)
    })
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    act(() => result.current.requestToggle(false))
    expect(useAutoRunStore.getState().enabled.translate).toBe(false)
  })

  it('cancelCost closes the gate without enabling', () => {
    act(() => useProviderStore.getState().setApiKey('sk-test'))
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    act(() => result.current.requestToggle(true))
    act(() => result.current.cancelCost())
    expect(useAutoRunStore.getState().enabled.translate).toBe(false)
    expect(useAutoRunStore.getState().costAck.anthropic).toBe(false)
    expect(result.current.costGateOpen).toBe(false)
  })
})

describe('useAutoRunPanel — paused state', () => {
  it('is paused when enabled but the provider is not ready', () => {
    act(() => {
      useProviderStore.getState().setApiKey('sk-test')
      useAutoRunStore.getState().ackCost('anthropic')
      useAutoRunStore.getState().setEnabled('translate', true)
    })
    const { result, rerender } = renderHook(() => useAutoRunPanel('translate'))
    expect(result.current.paused).toBe(false)
    act(() => useProviderStore.getState().clearKey())
    rerender()
    expect(result.current.paused).toBe(true)
  })

  it('is not paused when disabled even if the provider is unready', () => {
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    expect(result.current.paused).toBe(false)
  })
})

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

// M1 (Gate-4): the cost gate is re-checked on the LIVE path, not just at toggle time. Switching the
// active provider to an unacked hosted vendor while auto-run is on must suppress auto-fire + re-prompt.
describe('useAutoRunPanel — armed / cost re-gate on vendor switch', () => {
  it('is armed when enabled on a local provider (no ack required)', () => {
    act(() => {
      useProviderStore.getState().setVendor('ollama')
      useAutoRunStore.getState().setEnabled('translate', true)
    })
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    expect(result.current.armed).toBe(true)
    expect(result.current.costGateOpen).toBe(false)
  })

  it('is armed when enabled on an already-acked hosted provider', () => {
    act(() => {
      useProviderStore.getState().setApiKey('sk-test') // anthropic, hosted
      useAutoRunStore.getState().ackCost('anthropic')
      useAutoRunStore.getState().setEnabled('translate', true)
    })
    const { result } = renderHook(() => useAutoRunPanel('translate'))
    expect(result.current.armed).toBe(true)
  })

  it('suppresses auto-fire (armed=false) + re-opens the cost gate when the active vendor switches to an unacked hosted one', () => {
    act(() => {
      useProviderStore.getState().setVendor('ollama') // local — enabled directly, no ack
      useAutoRunStore.getState().setEnabled('translate', true)
    })
    const { result, rerender } = renderHook(() => useAutoRunPanel('translate'))
    expect(result.current.armed).toBe(true)

    act(() => {
      useProviderStore.getState().setVendor('anthropic') // hosted, never acked
      useProviderStore.getState().setApiKey('sk-test') // ready
    })
    rerender()
    expect(result.current.armed).toBe(false) // paid auto-runs suppressed until acked
    expect(result.current.costGateOpen).toBe(true) // re-prompted for the new vendor
  })

  it('confirmCost on the re-prompt acks the new vendor and re-arms', () => {
    act(() => {
      useProviderStore.getState().setVendor('ollama')
      useAutoRunStore.getState().setEnabled('translate', true)
    })
    const { result, rerender } = renderHook(() => useAutoRunPanel('translate'))
    act(() => {
      useProviderStore.getState().setVendor('anthropic')
      useProviderStore.getState().setApiKey('sk-test')
    })
    rerender()
    act(() => result.current.confirmCost())
    expect(useAutoRunStore.getState().costAck.anthropic).toBe(true)
    expect(result.current.armed).toBe(true)
    expect(result.current.costGateOpen).toBe(false)
  })

  it('cancelCost on the re-prompt turns the panel off (so the gate does not re-open)', () => {
    act(() => {
      useProviderStore.getState().setVendor('ollama')
      useAutoRunStore.getState().setEnabled('translate', true)
    })
    const { result, rerender } = renderHook(() => useAutoRunPanel('translate'))
    act(() => {
      useProviderStore.getState().setVendor('anthropic')
      useProviderStore.getState().setApiKey('sk-test')
    })
    rerender()
    act(() => result.current.cancelCost())
    expect(useAutoRunStore.getState().enabled.translate).toBe(false)
    expect(result.current.armed).toBe(false)
    expect(result.current.costGateOpen).toBe(false)
  })
})

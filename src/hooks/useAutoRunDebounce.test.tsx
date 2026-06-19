import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { LLMRequest } from '@/providers/types'

// Hoisted controllable doubles for the run pipeline + the two stores the hook reads via getState().
const h = vi.hoisted(() => ({ run: vi.fn(), state: { runId: 0, ready: true } }))
vi.mock('./usePanelRun', () => ({ usePanelRun: () => ({ run: h.run, abort: vi.fn() }) }))
vi.mock('@/stores/providerStore', () => ({
  useProviderStore: { getState: () => ({ isReady: () => h.state.ready }) },
}))
vi.mock('@/stores/operationStore', () => ({
  useOperationStore: {
    getState: () => ({
      translate: { runId: h.state.runId },
      polish: { runId: h.state.runId },
      draftTranslate: { runId: h.state.runId },
    }),
  },
}))

import { useAutoRunDebounce } from './useAutoRunDebounce'

const req: LLMRequest = { kind: 'translate', text: 'hello world', sourceLang: 'en', targetLang: 'zh' }
const MS = 1000

beforeEach(() => {
  h.run.mockClear()
  h.state.runId = 0
  h.state.ready = true
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

const setup = () => renderHook(() => useAutoRunDebounce('translate', { debounceMs: MS }))

describe('useAutoRunDebounce', () => {
  it('fires run(panel, request, isAuto=true) after the debounce settles', () => {
    const { result } = setup()
    act(() => result.current.scheduleRun(req))
    expect(result.current.isPending).toBe(true)
    expect(h.run).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).toHaveBeenCalledExactlyOnceWith('translate', req, true)
    expect(result.current.isPending).toBe(false)
  })

  it('resets the timer on each reschedule (only the last fires)', () => {
    const { result } = setup()
    act(() => result.current.scheduleRun(req))
    act(() => void vi.advanceTimersByTime(MS - 200))
    act(() => result.current.scheduleRun(req)) // reset
    act(() => void vi.advanceTimersByTime(MS - 200))
    expect(h.run).not.toHaveBeenCalled() // first timer would have fired by now without the reset
    act(() => void vi.advanceTimersByTime(200))
    expect(h.run).toHaveBeenCalledOnce()
  })

  it('cancel() before fire → run never called, isPending false', () => {
    const { result } = setup()
    act(() => result.current.scheduleRun(req))
    act(() => result.current.cancel())
    expect(result.current.isPending).toBe(false)
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).not.toHaveBeenCalled()
  })

  it('does NOT arm while composing (IME); compositionEnd re-arms from full duration', () => {
    const { result } = setup()
    act(() => result.current.onCompositionStart())
    expect(result.current.isComposing).toBe(true)
    act(() => result.current.scheduleRun(req)) // onChange during composition → no-op
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).not.toHaveBeenCalled()
    act(() => result.current.onCompositionEnd(req)) // commit → re-arm
    expect(result.current.isComposing).toBe(false)
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).toHaveBeenCalledExactlyOnceWith('translate', req, true)
  })

  it('compositionStart holds a pending timer (does not fire mid-compose)', () => {
    const { result } = setup()
    act(() => result.current.scheduleRun(req)) // armed
    act(() => result.current.onCompositionStart()) // composition begins → hold
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).not.toHaveBeenCalled()
  })

  it('does NOT arm when the provider is not ready', () => {
    h.state.ready = false
    const { result } = setup()
    act(() => result.current.scheduleRun(req))
    expect(result.current.isPending).toBe(false)
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).not.toHaveBeenCalled()
  })

  it('does NOT arm on empty / whitespace-only text (below minChars)', () => {
    const { result } = setup()
    act(() => result.current.scheduleRun({ ...req, text: '   ' }))
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).not.toHaveBeenCalled()
  })

  it('a stale runId at fire (a newer edit / manual run / abort) makes the pending a no-op', () => {
    const { result } = setup()
    act(() => result.current.scheduleRun(req))
    h.state.runId = 5 // something else advanced the op
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).not.toHaveBeenCalled()
  })

  it('bumps pendingKey on every (re)schedule (so the CSS ring restarts)', () => {
    const { result } = setup()
    const k0 = result.current.pendingKey
    act(() => result.current.scheduleRun(req))
    const k1 = result.current.pendingKey
    act(() => result.current.scheduleRun(req))
    expect(k1).toBeGreaterThan(k0)
    expect(result.current.pendingKey).toBeGreaterThan(k1)
  })

  it('clears the timer on unmount (no fire after the component is gone)', () => {
    const { result, unmount } = setup()
    act(() => result.current.scheduleRun(req))
    unmount()
    act(() => void vi.advanceTimersByTime(MS))
    expect(h.run).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditableLookup, type UseEditableLookupOptions } from './useEditableLookup'

// WI-2 — thin React glue over the arm reducer: Alt listeners, blur/visibility reset (L9),
// typing debounce, composition suppression, toggle/exit.

const fireKey = (type: 'keydown' | 'keyup', init: KeyboardEventInit) =>
  act(() => void window.dispatchEvent(new KeyboardEvent(type, init)))

const setup = (opts: Partial<UseEditableLookupOptions> = {}) =>
  renderHook(() => useEditableLookup({ textNonEmpty: true, ...opts }))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useEditableLookup', () => {
  it('starts off and disarmed', () => {
    const { result } = setup()
    expect(result.current.mode).toBe('off')
    expect(result.current.armed).toBe(false)
  })

  it('Alt down arms (non-empty, not typing); Alt up disarms', () => {
    const { result } = setup()
    fireKey('keydown', { key: 'Alt' })
    expect(result.current.mode).toBe('alt')
    expect(result.current.armed).toBe(true)
    fireKey('keyup', { key: 'Alt' })
    expect(result.current.mode).toBe('off')
    expect(result.current.armed).toBe(false)
  })

  it('does not arm when text is empty even with a mode active', () => {
    const { result } = setup({ textNonEmpty: false })
    fireKey('keydown', { key: 'Alt' })
    expect(result.current.mode).toBe('alt')
    expect(result.current.armed).toBe(false)
  })

  it('toggle latches on, survives Alt up, and toggles back off', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    expect(result.current.mode).toBe('latched')
    expect(result.current.armed).toBe(true)
    fireKey('keydown', { key: 'Alt' })
    fireKey('keyup', { key: 'Alt' })
    expect(result.current.mode).toBe('latched')
    act(() => result.current.toggle())
    expect(result.current.mode).toBe('off')
  })

  it('window blur resets a stuck alt to off (L9)', () => {
    const { result } = setup()
    fireKey('keydown', { key: 'Alt' })
    expect(result.current.mode).toBe('alt')
    act(() => void window.dispatchEvent(new Event('blur')))
    expect(result.current.mode).toBe('off')
  })

  it('document visibilitychange resets to off (L9)', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current.mode).toBe('off')
  })

  it('Alt+another-key is an edit (exits), not an arm', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    fireKey('keydown', { key: 's', altKey: true })
    expect(result.current.mode).toBe('off')
  })

  it('plain typing keydown does not exit latched (debounce handles it)', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    fireKey('keydown', { key: 'h', altKey: false })
    expect(result.current.mode).toBe('latched')
  })

  it('Escape exits to off', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    fireKey('keydown', { key: 'Escape' })
    expect(result.current.mode).toBe('off')
  })

  it('typing disarms, then re-arms ~400ms after the last keystroke', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    expect(result.current.armed).toBe(true)
    act(() => result.current.onTextInput())
    expect(result.current.typing).toBe(true)
    expect(result.current.armed).toBe(false)
    act(() => void vi.advanceTimersByTime(399))
    expect(result.current.armed).toBe(false)
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.typing).toBe(false)
    expect(result.current.armed).toBe(true)
  })

  it('typing resets the debounce on each keystroke (only the last re-arms)', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    act(() => result.current.onTextInput())
    act(() => void vi.advanceTimersByTime(300))
    act(() => result.current.onTextInput()) // reset
    act(() => void vi.advanceTimersByTime(300))
    expect(result.current.armed).toBe(false) // first timer would have re-armed without the reset
    act(() => void vi.advanceTimersByTime(100))
    expect(result.current.armed).toBe(true)
  })

  it('setComposing suppresses arming until composition ends', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    act(() => result.current.setComposing(true))
    expect(result.current.armed).toBe(false)
    act(() => result.current.setComposing(false))
    expect(result.current.armed).toBe(true)
  })

  it('window composition events drive the composing flag', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    act(() => void window.dispatchEvent(new Event('compositionstart')))
    expect(result.current.armed).toBe(false)
    act(() => void window.dispatchEvent(new Event('compositionend')))
    expect(result.current.armed).toBe(true)
  })

  it('streaming passed in disarms even when latched', () => {
    const { result } = setup({ streaming: true })
    act(() => result.current.toggle())
    expect(result.current.mode).toBe('latched')
    expect(result.current.armed).toBe(false)
  })

  it('exit() returns to off from latched', () => {
    const { result } = setup()
    act(() => result.current.toggle())
    act(() => result.current.exit())
    expect(result.current.mode).toBe('off')
  })
})

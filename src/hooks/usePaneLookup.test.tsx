// WI-4 — usePaneLookup: per-pane glue tying useEditableLookup (arm/toggle) to the lookupStore
// (feature #169). Covers: toggle arms when text is non-empty + not streaming; streaming disarms;
// empty text never arms; and close-on-edit (M6) — a text-value change closes ONLY this owner's
// open lookup (keyed on the value, since programmatic writes bypass onChange).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))

import { usePaneLookup } from './usePaneLookup'
import { useLookupStore } from '@/stores/lookupStore'

beforeEach(() => {
  lookupMock.lookup.mockReset()
  lookupMock.close.mockReset()
  useLookupStore.getState().close()
})

describe('usePaneLookup — arm decision', () => {
  it('arms when toggled on with non-empty text', () => {
    const { result } = renderHook(() =>
      usePaneLookup({ text: 'hello', owner: 'polishOriginal', sourceLang: 'en', targetLang: 'zh' }),
    )
    expect(result.current.armed).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.mode).toBe('latched')
    expect(result.current.armed).toBe(true)
  })

  it('never arms when the text is empty even if latched', () => {
    const { result } = renderHook(() =>
      usePaneLookup({ text: '   ', owner: 'polishOriginal', sourceLang: 'en', targetLang: 'zh' }),
    )
    act(() => result.current.toggle())
    expect(result.current.mode).toBe('latched')
    expect(result.current.armed).toBe(false)
  })

  it('disarms while streaming even if latched', () => {
    const { result } = renderHook(() =>
      usePaneLookup({ text: 'hi', owner: 'polishDraft', sourceLang: 'en', targetLang: 'zh', streaming: true }),
    )
    act(() => result.current.toggle())
    expect(result.current.armed).toBe(false)
  })
})

describe('usePaneLookup — close-on-edit (M6)', () => {
  function openFor(owner: Parameters<typeof useLookupStore.setState>[0] extends never ? never : string) {
    act(() => {
      useLookupStore.setState({ open: true, owner: owner as never, word: 'x' })
    })
  }

  it('closes this owner’s open lookup when the text value changes', () => {
    const { rerender } = renderHook(
      ({ text }) => usePaneLookup({ text, owner: 'polishDraft', sourceLang: 'en', targetLang: 'zh' }),
      { initialProps: { text: 'hello world' } },
    )
    openFor('polishDraft')
    lookupMock.close.mockReset()
    rerender({ text: 'hello worlds' }) // programmatic/edit value change
    expect(lookupMock.close).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when the open lookup belongs to another owner', () => {
    const { rerender } = renderHook(
      ({ text }) => usePaneLookup({ text, owner: 'polishDraft', sourceLang: 'en', targetLang: 'zh' }),
      { initialProps: { text: 'hello' } },
    )
    openFor('translateSource')
    lookupMock.close.mockReset()
    rerender({ text: 'hello!' })
    expect(lookupMock.close).not.toHaveBeenCalled()
  })

  it('does NOT close when no lookup is open', () => {
    const { rerender } = renderHook(
      ({ text }) => usePaneLookup({ text, owner: 'polishDraft', sourceLang: 'en', targetLang: 'zh' }),
      { initialProps: { text: 'hello' } },
    )
    rerender({ text: 'hello there' })
    expect(lookupMock.close).not.toHaveBeenCalled()
  })
})

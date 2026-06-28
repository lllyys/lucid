// WI-4 — EditableLookupOverlay touch long-press (feature #169, design §F): a ~450 ms long-press on
// an armed word span opens the lookup; a touchmove (scroll/select) cancels it; and the synthetic
// click that follows a fired long-press is suppressed so a word isn't looked up twice.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRef } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'

import '@/i18n'

const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))
import type { ViewportTier } from '@/hooks/useViewportTier'
const tierMock = vi.hoisted(() => ({ value: 'phone' as ViewportTier }))
vi.mock('@/hooks/useViewportTier', () => ({ useViewportTier: () => tierMock.value }))
const speechMock = vi.hoisted(() => ({
  api: {
    speak: vi.fn(),
    cancel: vi.fn(),
    isSpeaking: () => false,
    hasVoiceFor: () => true,
    voicesReady: true,
    subscribe: () => () => {},
  },
}))
vi.mock('@/lib/speech/speak', () => ({ createSpeech: () => speechMock.api }))

import { EditableLookupOverlay } from './EditableLookupOverlay'
import { useLookupStore } from '@/stores/lookupStore'

function Harness() {
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <div style={{ position: 'relative' }}>
      <textarea ref={ref} defaultValue="hello world" aria-label="field" />
      <EditableLookupOverlay
        textareaRef={ref}
        text="hello world"
        owner="polishDraft"
        sourceLang="en"
        targetLang="zh"
        armed
      />
    </div>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  lookupMock.lookup.mockReset()
  useLookupStore.getState().close()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('EditableLookupOverlay — long-press', () => {
  it('opens the lookup after a ~450 ms long-press on a word span', () => {
    render(<Harness />)
    const word = screen.getByRole('button', { name: 'world' })
    fireEvent.touchStart(word)
    act(() => vi.advanceTimersByTime(460))
    expect(lookupMock.lookup).toHaveBeenCalledWith(
      expect.objectContaining({ word: 'world', owner: 'polishDraft', targetLang: 'zh' }),
    )
  })

  it('cancels the long-press if the finger moves (scroll/select) before it fires', () => {
    render(<Harness />)
    const word = screen.getByRole('button', { name: 'world' })
    fireEvent.touchStart(word)
    act(() => vi.advanceTimersByTime(200))
    fireEvent.touchMove(word)
    act(() => vi.advanceTimersByTime(400))
    expect(lookupMock.lookup).not.toHaveBeenCalled()
  })

  it('suppresses the synthetic click that follows a fired long-press (no double lookup)', () => {
    render(<Harness />)
    const word = screen.getByRole('button', { name: 'world' })
    fireEvent.touchStart(word)
    act(() => vi.advanceTimersByTime(460))
    fireEvent.touchEnd(word)
    fireEvent.click(word) // the browser's follow-up click after a long-press
    expect(lookupMock.lookup).toHaveBeenCalledTimes(1)
  })
})

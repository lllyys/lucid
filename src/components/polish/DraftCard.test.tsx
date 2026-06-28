// WI-4 — DraftCard word-lookup wiring (feature #169): the Draft is in the TARGET language, so its
// lookup langs are INVERTED (sourceLang = tgtLang, targetLang = srcLang). The overlay is disarmed
// while "Translate original" streams (plan M3, gated on `translating`). Owner = 'polishDraft'.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'

const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))

import { DraftCard } from './DraftCard'
import { useLookupStore } from '@/stores/lookupStore'

beforeEach(() => {
  lookupMock.lookup.mockReset()
  lookupMock.close.mockReset()
  useLookupStore.getState().close()
})

const renderCard = (over: Partial<React.ComponentProps<typeof DraftCard>> = {}) =>
  render(
    <DraftCard
      value="hello world"
      onChange={vi.fn()}
      lang="en"
      onLang={vi.fn()}
      targetLang="zh"
      onTranslateOriginal={vi.fn()}
      onStopTranslate={vi.fn()}
      translating={false}
      {...over}
    />,
  )

describe('DraftCard — lookup wiring', () => {
  it('an armed word click opens a polishDraft lookup with INVERTED langs (draft=target)', async () => {
    // Draft language is 'en' (tgtLang); the original side is 'zh' (srcLang). A draft word is an
    // 'en' word looked up INTO 'zh' → sourceLang 'en', targetLang 'zh'.
    renderCard({ lang: 'en', targetLang: 'zh' })
    await userEvent.click(screen.getByRole('button', { name: /lookup/i }))
    await userEvent.click(screen.getByRole('button', { name: 'world' }))
    expect(lookupMock.lookup).toHaveBeenCalledWith(
      expect.objectContaining({ word: 'world', owner: 'polishDraft', sourceLang: 'en', targetLang: 'zh' }),
    )
  })

  it('stays disarmed while translating even if the toggle is on (M3 streaming gate)', async () => {
    renderCard({ translating: true })
    // While translating, the ⌕ control is not offered as an arming toggle (the header shows the
    // translating note), so no clickable word spans appear.
    expect(screen.queryByRole('button', { name: 'world' })).not.toBeInTheDocument()
  })

  it('arms once translation has settled (a never-translated draft is lookupable)', async () => {
    renderCard({ translating: false })
    await userEvent.click(screen.getByRole('button', { name: /lookup/i }))
    expect(screen.getByRole('button', { name: 'world' })).toBeInTheDocument()
  })

  it('closes an open polishDraft lookup when the draft value changes (M6 close-on-edit)', () => {
    const { rerender } = renderCard({ value: 'hello world' })
    act(() => {
      useLookupStore.setState({ open: true, owner: 'polishDraft', word: 'world' })
    })
    lookupMock.close.mockReset()
    // A programmatic value change (stream/swap/accept) bypasses onChange — the effect keys on value.
    rerender(
      <DraftCard
        value="hello worlds"
        onChange={vi.fn()}
        lang="en"
        onLang={vi.fn()}
        targetLang="zh"
        onTranslateOriginal={vi.fn()}
        onStopTranslate={vi.fn()}
        translating={false}
      />,
    )
    expect(lookupMock.close).toHaveBeenCalledTimes(1)
  })
})

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
      onClear={vi.fn()}
      lang="en"
      onLang={vi.fn()}
      targetLang="zh"
      onTranslateOriginal={vi.fn()}
      onStopTranslate={vi.fn()}
      translating={false}
      {...over}
    />,
  )

// WI-1 (feature #26) — the Draft editor rests tighter: textarea inner min 88px → 56px, card
// min 130px → 98px, via the shared EDITOR_FIELD_MIN_H / EDITOR_CARD_MIN_H constants. Grow-to-content
// and the 88vh cap are untouched.
describe('DraftCard — resting height (#26)', () => {
  it('rests the textarea at 56px and the card at 98px (tighter min)', () => {
    const { container } = renderCard()
    const textarea = screen.getByLabelText('Draft to polish')
    expect(textarea.className).toContain('min-h-[56px]')
    expect(textarea.className.split(/\s+/)).not.toContain('min-h-[88px]')
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('min-h-[98px]')
    expect(card.className.split(/\s+/)).not.toContain('min-h-[130px]')
  })
})

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
        onClear={vi.fn()}
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

// WI-1 (feature #27) — the Clear button on the DRAFT-to-polish (input) pane. Mirrors the #23
// Original Clear (wipe + refocus, shown only on non-whitespace text) with one addition: the Draft is a
// streaming target, so Clear is ALSO gated on `!translating` (Stop owns the field mid-stream). The
// header dual-renders a phone + desktop Clear (one display:none per breakpoint); jsdom loads no CSS so
// BOTH are present in the tree — queries are scoped with getAllByRole, never a bare getByRole.
describe('DraftCard — Clear button (feature #27)', () => {
  const clears = () => screen.queryAllByRole('button', { name: /clear/i })

  it('hides Clear when the field is empty', () => {
    renderCard({ value: '' })
    expect(clears()).toHaveLength(0)
  })

  it('hides Clear when the field is whitespace-only', () => {
    renderCard({ value: '   \n\t ' })
    expect(clears()).toHaveLength(0)
  })

  it('shows Clear (phone + desktop dual-render) when the field has text and is not translating', () => {
    renderCard({ value: 'hello world', translating: false })
    expect(clears()).toHaveLength(2)
  })

  it('hides Clear while translating — the draftTranslate stream owns the field, Stop is the exit', () => {
    renderCard({ value: 'hello world', translating: true })
    expect(clears()).toHaveLength(0)
  })

  it('keeps Clear shown while a polish op streams (guard is !translating only, never isPolishing)', () => {
    // A polish stream does NOT raise `translating` (that flag is draftTranslate-only); from DraftCard's
    // view translating stays false, so Clear remains available to reset the polish input mid-stream.
    renderCard({ value: 'hello world', translating: false })
    expect(clears()).toHaveLength(2)
  })

  it('calls onClear (not onChange) and refocuses the Draft textarea when clicked', async () => {
    const onClear = vi.fn()
    const onChange = vi.fn()
    renderCard({ value: 'hello world', onClear, onChange })
    await userEvent.click(clears()[0])
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveFocus()
  })

  it('labels the button with polish.clear ("Clear")', () => {
    renderCard({ value: 'hello world' })
    expect(clears()[0]).toHaveAccessibleName('Clear')
  })

  it('gives the phone Clear a ≥44px hit target and leads the desktop control group', () => {
    renderCard({ value: 'hello world' })
    const all = clears()
    const phone = all.find((b) => b.className.includes('min-h-11'))
    const desktop = all.find((b) => b.className.includes('min-[600px]:inline-flex'))
    expect(phone).toBeDefined()
    expect(desktop).toBeDefined()
    // The desktop Clear leads the right-side group — before Translate original / lookup / language.
    const translate = screen.getByRole('button', { name: /translate original/i })
    const lookupToggle = screen.getByRole('button', { name: /lookup/i })
    const picker = screen.getByRole('button', { name: /draft to polish language/i })
    expect(desktop!.compareDocumentPosition(translate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(desktop!.compareDocumentPosition(lookupToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(desktop!.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

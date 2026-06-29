// WI-4 — OriginalCard word-lookup wiring (feature #169): the ⌕ toggle arms the mirror overlay;
// an armed word click opens a lookup owned by 'polishOriginal' with the polish src→tgt langs
// (NOT inverted — the Original is in the source language). A bare/disarmed field stays edit-only.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'

const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))

import { OriginalCard } from './OriginalCard'
import { useLookupStore } from '@/stores/lookupStore'

beforeEach(() => {
  lookupMock.lookup.mockReset()
  lookupMock.close.mockReset()
  useLookupStore.getState().close()
})

const renderCard = (over: Partial<React.ComponentProps<typeof OriginalCard>> = {}) =>
  render(
    <OriginalCard
      value="hello world"
      onChange={vi.fn()}
      onClear={vi.fn()}
      lang="en"
      onLang={vi.fn()}
      targetLang="zh"
      {...over}
    />,
  )

describe('OriginalCard — lookup wiring', () => {
  it('does not expose clickable word spans until lookup is toggled on (caret sacred)', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: 'world' })).not.toBeInTheDocument()
  })

  it('arms the overlay when the ⌕ toggle is clicked', async () => {
    renderCard()
    await userEvent.click(screen.getByRole('button', { name: /lookup/i }))
    expect(screen.getByRole('button', { name: 'world' })).toBeInTheDocument()
  })

  it('an armed word click opens a polishOriginal lookup with src→tgt langs', async () => {
    renderCard({ lang: 'en', targetLang: 'zh' })
    await userEvent.click(screen.getByRole('button', { name: /lookup/i }))
    await userEvent.click(screen.getByRole('button', { name: 'world' }))
    expect(lookupMock.lookup).toHaveBeenCalledWith(
      expect.objectContaining({ word: 'world', owner: 'polishOriginal', sourceLang: 'en', targetLang: 'zh' }),
    )
  })

  it('disables the ⌕ toggle when the field is empty', () => {
    renderCard({ value: '' })
    expect(screen.getByRole('button', { name: /lookup/i })).toBeDisabled()
  })
})

// WI-1 (feature #23) — the Clear button on the polish Original (input) pane. Mirrors the translate
// source Clear: wipes the input + refocuses, shown only when the field has non-whitespace text, and
// leading the right-side control group (before the lookup toggle + language picker).
describe('OriginalCard — Clear button (feature #23)', () => {
  it('hides Clear when the field is empty', () => {
    renderCard({ value: '' })
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('hides Clear when the field is whitespace-only', () => {
    renderCard({ value: '   \n\t ' })
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('shows Clear when the field has text', () => {
    renderCard({ value: 'hello world' })
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('calls onClear (not onChange) when clicked', async () => {
    const onClear = vi.fn()
    const onChange = vi.fn()
    renderCard({ value: 'hello world', onClear, onChange })
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('returns focus to the Original textarea after clearing', async () => {
    renderCard({ value: 'hello world', onClear: vi.fn() })
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('textbox', { name: 'Original' })).toHaveFocus()
  })

  it('leads the right-side control group — before the lookup toggle and language picker', () => {
    renderCard({ value: 'hello world', onClear: vi.fn() })
    const clear = screen.getByRole('button', { name: 'Clear' })
    const lookup = screen.getByRole('button', { name: /lookup/i })
    const picker = screen.getByRole('button', { name: /original language/i })
    expect(clear.compareDocumentPosition(lookup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(clear.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

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

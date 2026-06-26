import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'

// --- mocks -----------------------------------------------------------------
const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))

import type { ViewportTier } from '@/hooks/useViewportTier'
const tierMock = vi.hoisted(() => ({ value: 'desktop' as ViewportTier }))
vi.mock('@/hooks/useViewportTier', () => ({ useViewportTier: () => tierMock.value }))

import { WordLookupPopover } from './WordLookupPopover'
import { useLookupStore } from '@/stores/lookupStore'
import type { DefineSense } from '@/lib/lookup/parseDefine'

beforeEach(() => {
  lookupMock.lookup.mockReset()
  lookupMock.close.mockReset()
  useLookupStore.getState().close()
})
afterEach(() => {
  tierMock.value = 'desktop'
})

// Helper to drive the store into a given lookup state for the open word.
function openStore(over: Partial<ReturnType<typeof useLookupStore.getState>>) {
  act(() => {
    useLookupStore.setState({
      open: true,
      word: 'stutter',
      ipa: '/ˈstʌtər/',
      partOfSpeech: 'noun',
      translations: ['卡顿'],
      meaning: 'a brief judder',
      senses: [] as DefineSense[],
      status: 'done',
      sentence: 'perceive stutter',
      sourceLang: 'en',
      targetLang: 'zh',
      ...over,
    })
  })
}

describe('WordLookupPopover — WI-6 clickable text wiring', () => {
  it('renders plain text (no clickable words) while NOT done (streaming pane)', () => {
    render(<WordLookupPopover text="Hello world" done={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it('renders clickable words once the host pane is done', () => {
    render(<WordLookupPopover text="Hello world" done />)
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument()
  })

  it('drives useWordLookup.lookup on activate with the clicked word + threaded en→zh', async () => {
    render(<WordLookupPopover text="Hello world" done />)
    await userEvent.click(screen.getByRole('button', { name: 'world' }))
    expect(lookupMock.lookup).toHaveBeenCalledTimes(1)
    const payload = lookupMock.lookup.mock.calls[0][0]
    expect(payload.word).toBe('world')
    expect(payload.sourceLang).toBe('en')
    expect(payload.targetLang).toBe('zh')
    expect(payload.sentence).toContain('world')
  })

  it('threads zh→en for a Chinese result pane', async () => {
    render(<WordLookupPopover text="你好世界" done />)
    await userEvent.click(screen.getAllByRole('button')[0])
    const payload = lookupMock.lookup.mock.calls[0][0]
    expect(payload.sourceLang).toBe('zh')
    expect(payload.targetLang).toBe('en')
  })

  it('highlights the active word (aria-current) while its lookup is open', async () => {
    render(<WordLookupPopover text="Hello world" done />)
    await userEvent.click(screen.getByRole('button', { name: 'world' }))
    openStore({ word: 'world', sentence: 'Hello world' })
    expect(screen.getByRole('button', { name: 'world' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Hello' })).not.toHaveAttribute('aria-current', 'true')
  })

  it('clears the highlight when the lookup store closes', async () => {
    render(<WordLookupPopover text="Hello world" done />)
    await userEvent.click(screen.getByRole('button', { name: 'world' }))
    openStore({ word: 'world', sentence: 'Hello world' })
    act(() => useLookupStore.getState().close())
    expect(screen.getByRole('button', { name: 'world' })).not.toHaveAttribute('aria-current', 'true')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { PolishResult } from './PolishResult'
import { useOperationStore } from '@/stores/operationStore'
import type { ViewportTier } from '@/hooks/useViewportTier'

// Drive the responsive tier by mocking the hook (plan M5). Default desktop = byte-for-byte unchanged.
const tierMock = vi.hoisted(() => ({ value: 'desktop' as ViewportTier }))
vi.mock('@/hooks/useViewportTier', () => ({ useViewportTier: () => tierMock.value }))

// Word-lookup wiring (feature #20, WI-6): stub the lookup hook so clicking a word is observable.
const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))
import { useLookupStore } from '@/stores/lookupStore'
import { useStarredStore } from '@/stores/starredStore'

// draft "the cat sat" vs result "the dog sat" → exactly one change hunk (cat → dog).
const DRAFT = 'the cat sat'
const setDone = (text: string) =>
  useOperationStore.setState({ polish: { status: 'done', text, startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false } })

beforeEach(() => {
  useOperationStore.getState().reset('polish')
  lookupMock.lookup.mockReset()
  useLookupStore.getState().close()
  useStarredStore.getState().reset()
})

afterEach(() => {
  tierMock.value = 'desktop'
})

const renderResult = (overrides: Partial<Parameters<typeof PolishResult>[0]> = {}) => {
  const props = { draft: DRAFT, onAccept: vi.fn(), onRegenerate: vi.fn(), onReject: vi.fn(), ...overrides }
  render(<PolishResult {...props} />)
  return props
}

describe('PolishResult per-hunk accept/reject (WI-7)', () => {
  it('Accept with no rejections commits the full polished result', async () => {
    setDone('the dog sat')
    const { onAccept } = renderResult()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledWith('the dog sat')
  })

  it('rejecting the change hunk reverts just that span on Accept', async () => {
    setDone('the dog sat')
    const { onAccept } = renderResult()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /compare/i }))
    await user.click(screen.getByRole('button', { name: /reject this change/i }))
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledWith('the cat sat')
  })

  it('Reject all then Accept yields the original draft', async () => {
    setDone('the dog sat')
    const { onAccept } = renderResult()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /compare/i }))
    await user.click(screen.getByRole('button', { name: /reject all/i }))
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledWith('the cat sat')
  })

  it('shows an N-of-M kept summary that updates as hunks are rejected', async () => {
    setDone('the dog sat')
    renderResult()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /compare/i }))
    expect(screen.getByText('1 of 1 kept')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /reject this change/i }))
    expect(screen.getByText('0 of 1 kept')).toBeInTheDocument()
  })

  it('the explicit Reject button discards the polish (keeps the draft)', async () => {
    setDone('the dog sat')
    const { onReject, onAccept } = renderResult()
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onReject).toHaveBeenCalledOnce()
    expect(onAccept).not.toHaveBeenCalled()
  })

  it('a new result (new runId) resets prior per-hunk rejections', async () => {
    useOperationStore.setState({ polish: { status: 'done', text: 'the dog sat', startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false } })
    const { onAccept } = renderResult()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /compare/i }))
    await user.click(screen.getByRole('button', { name: /reject this change/i }))
    expect(screen.getByText('0 of 1 kept')).toBeInTheDocument()
    // a fresh polish result arrives (runId bumps) — the rejection must clear
    await act(async () => {
      useOperationStore.setState({ polish: { status: 'done', text: 'the dog sat', startedAt: 0, elapsedMs: 1, runId: 2, isAuto: false } })
    })
    await user.click(screen.getByRole('button', { name: /compare/i }))
    expect(screen.getByText('1 of 1 kept')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledWith('the dog sat')
  })

  it('toggling a rejected hunk back keeps it again', async () => {
    setDone('the dog sat')
    const { onAccept } = renderResult()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /compare/i }))
    await user.click(screen.getByRole('button', { name: /reject this change/i }))
    await user.click(screen.getByRole('button', { name: /keep this change/i }))
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledWith('the dog sat')
  })
})

describe('PolishResult sticky sub-header on mobile (WI-3, design Section C)', () => {
  it('makes the Result/Compare toggle a sticky sub-header on phone', () => {
    tierMock.value = 'phone'
    setDone('the dog sat')
    const { container } = render(<PolishResult draft={DRAFT} onAccept={vi.fn()} onRegenerate={vi.fn()} onReject={vi.fn()} />)
    const subHeader = container.querySelector('[data-slot="polish-subheader"]')!
    expect(subHeader).not.toBeNull()
    expect(subHeader.className).toContain('sticky')
    expect(subHeader.className).toContain('top-0')
  })

  it('keeps the desktop layout free of the sticky sub-header (byte-for-byte unchanged)', () => {
    tierMock.value = 'desktop'
    setDone('the dog sat')
    const { container } = render(<PolishResult draft={DRAFT} onAccept={vi.fn()} onRegenerate={vi.fn()} onReject={vi.fn()} />)
    const subHeader = container.querySelector('[data-slot="polish-subheader"]')!
    expect(subHeader.className).not.toContain('sticky')
  })

  it('keeps accept/reject reachable from the mobile result (accept fires onAccept)', async () => {
    tierMock.value = 'phone'
    setDone('the dog sat')
    const onAccept = vi.fn()
    render(<PolishResult draft={DRAFT} onAccept={onAccept} onRegenerate={vi.fn()} onReject={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledWith('the dog sat')
  })
})

describe('PolishResult word-lookup wiring (feature #20, WI-6)', () => {
  it('makes Result-view words clickable at done and opens a lookup on click', async () => {
    setDone('the dog sat')
    renderResult()
    const word = screen.getByRole('button', { name: 'dog' })
    await userEvent.click(word)
    expect(lookupMock.lookup).toHaveBeenCalledTimes(1)
    expect(lookupMock.lookup.mock.calls[0][0].word).toBe('dog')
  })

  it('the Compare view has NO clickable word tokens (descoped — plan §Scope)', async () => {
    setDone('the dog sat')
    renderResult()
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))
    // Compare exposes hunk toggles + view/action chrome, never word-lookup buttons
    expect(screen.queryByRole('button', { name: 'dog' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'sat' })).not.toBeInTheDocument()
  })
})

describe('PolishResult — sentence star (feature #22, WI-3)', () => {
  it('stars the draft → polished pair at done (kind:sentence, cleaned result)', async () => {
    setDone('the dog sat')
    renderResult({ lang: 'en' })
    await userEvent.click(screen.getByRole('button', { name: 'Star' }))
    const items = useStarredStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'sentence',
      source: DRAFT,
      translation: 'the dog sat',
      sourceLang: 'en',
      targetLang: 'en',
    })
    expect(screen.getByRole('button', { name: 'Starred' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('stores the CLEANED result, not the raw model prose', async () => {
    setDone('Here is the improved sentence:\n\n"the dog sat"\n\nChanges made:\n- cat → dog')
    renderResult({ lang: 'en' })
    await userEvent.click(screen.getByRole('button', { name: 'Star' }))
    expect(useStarredStore.getState().items[0].translation).toBe('the dog sat')
  })

  it('does NOT show the sentence star while streaming', () => {
    useOperationStore.setState({ polish: { status: 'streaming', text: 'the', startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false } })
    renderResult({ lang: 'en' })
    expect(screen.queryByRole('button', { name: /^star(red)?$/i })).toBeNull()
  })
})

describe('PolishResult strips model meta-prose from the done result (bug #96)', () => {
  // A non-compliant model wraps the answer in a preamble + quotes + a "Changes made:" list.
  const RAW = 'Here is the improved sentence:\n\n"the dog sat"\n\nChanges made:\n- cat → dog'

  it('shows only the polished sentence in the Result view (no preamble, no changes list)', () => {
    setDone(RAW)
    renderResult()
    // The cleaned sentence renders as word-lookup tokens (feature #20); the preamble + "Changes
    // made:" list must be stripped before tokenization, so their words never appear.
    expect(screen.getByRole('button', { name: 'dog' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'sat' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'improved' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Changes' })).toBeNull()
    expect(screen.queryByText(/Here is the improved sentence/i)).toBeNull()
    expect(screen.queryByText(/Changes made/i)).toBeNull()
  })

  it('Accept commits the cleaned text, and the Compare diff is computed against it (cat → dog)', async () => {
    setDone(RAW)
    const { onAccept } = renderResult()
    const user = userEvent.setup()
    // the diff is the clean draft→result diff, so one hunk; Accept commits the clean sentence
    await user.click(screen.getByRole('button', { name: /compare/i }))
    expect(screen.getByText('1 of 1 kept')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledWith('the dog sat')
  })
})

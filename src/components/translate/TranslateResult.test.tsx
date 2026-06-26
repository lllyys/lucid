import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'

const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))

import { TranslateResult } from './TranslateResult'
import { useOperationStore } from '@/stores/operationStore'
import { useLookupStore } from '@/stores/lookupStore'

const renderResult = () =>
  render(<TranslateResult accepted={false} onAccept={vi.fn()} onRetry={vi.fn()} />)

beforeEach(() => {
  lookupMock.lookup.mockReset()
  useOperationStore.getState().reset('translate')
  useLookupStore.getState().close()
})

describe('TranslateResult — word-lookup wiring (feature #20)', () => {
  it('renders the done result text and makes its words clickable', () => {
    useOperationStore.setState({
      translate: { status: 'done', text: 'Hello world', startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false },
    })
    renderResult()
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument()
  })

  it('does NOT make words clickable while streaming (stale-offset guard)', () => {
    useOperationStore.setState({
      translate: { status: 'streaming', text: 'Hello world', startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false },
    })
    renderResult()
    // the only buttons present must not be word tokens — Copy/Accept appear only at done
    expect(screen.queryByRole('button', { name: 'Hello' })).not.toBeInTheDocument()
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it('clicking a word opens a lookup for that word', async () => {
    useOperationStore.setState({
      translate: { status: 'done', text: 'Hello world', startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false },
    })
    renderResult()
    await userEvent.click(screen.getByRole('button', { name: 'world' }))
    expect(lookupMock.lookup).toHaveBeenCalledTimes(1)
    expect(lookupMock.lookup.mock.calls[0][0].word).toBe('world')
  })

  it('still shows Copy and Accept at done (no regression)', () => {
    useOperationStore.setState({
      translate: { status: 'done', text: 'Hello world', startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false },
    })
    renderResult()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { PolishResult } from './PolishResult'
import { useOperationStore } from '@/stores/operationStore'

// draft "the cat sat" vs result "the dog sat" → exactly one change hunk (cat → dog).
const DRAFT = 'the cat sat'
const setDone = (text: string) =>
  useOperationStore.setState({ polish: { status: 'done', text, startedAt: 0, elapsedMs: 1, runId: 1 } })

beforeEach(() => {
  useOperationStore.getState().reset('polish')
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

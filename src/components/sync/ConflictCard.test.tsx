// WI-9c — Settings · Sync conflict card (design surface E): the v1 superseded-edit signal.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { ConflictCard } from './ConflictCard'

describe('ConflictCard', () => {
  it('renders the superseded-edit heading, body and review-deferred note', () => {
    render(<ConflictCard conflict={{ type: 'term', id: 't1' }} onDismiss={vi.fn()} />)
    expect(screen.getByText(/a local edit was superseded/i)).toBeInTheDocument()
    expect(screen.getByText(/your earlier version was superseded/i)).toBeInTheDocument()
    expect(screen.getByText(/side-by-side review & restore arrives in a later release/i)).toBeInTheDocument()
  })

  it('shows the item with its entity-type label', () => {
    render(<ConflictCard conflict={{ type: 'term', id: 'glossary-99' }} onDismiss={vi.fn()} />)
    expect(screen.getByText(/glossary term · glossary-99/i)).toBeInTheDocument()
  })

  it.each([
    { type: 'session', label: /session/i },
    { type: 'task', label: /task/i },
    { type: 'keyword', label: /polish keyword/i },
  ] as const)('labels the $type entity', ({ type, label }) => {
    render(<ConflictCard conflict={{ type, id: 'x' }} onDismiss={vi.fn()} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('Dismiss fires onDismiss', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<ConflictCard conflict={{ type: 'term', id: 't1' }} onDismiss={onDismiss} />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('Copy my version is shown but disabled (side-by-side review/restore deferred to a later release)', () => {
    render(<ConflictCard conflict={{ type: 'term', id: 't1' }} onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: /copy my version/i })).toBeDisabled()
  })
})

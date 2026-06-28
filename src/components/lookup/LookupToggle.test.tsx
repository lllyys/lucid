// WI-4 — LookupToggle: the ⌕ pane-header lookup-mode toggle (feature #169, design §B).
// A toggle BUTTON (aria-pressed), NOT role=switch, so it never collides with the panes'
// AutoRunToggle switch. Disabled when the field is empty (design §D), reflects the latched
// state via aria-pressed, and fires onToggle on click.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { LookupToggle } from './LookupToggle'

describe('LookupToggle', () => {
  it('renders a toggle button (not a switch) with a lookup accessible name', () => {
    render(<LookupToggle active={false} onToggle={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /lookup/i })
    expect(btn).toBeInTheDocument()
    // Must not be a switch — the panes already own a role=switch (AutoRunToggle).
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('reflects the latched state via aria-pressed', () => {
    const { rerender } = render(<LookupToggle active={false} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /lookup/i })).toHaveAttribute('aria-pressed', 'false')
    rerender(<LookupToggle active onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /lookup/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onToggle on click', async () => {
    const onToggle = vi.fn()
    render(<LookupToggle active={false} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button', { name: /lookup/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('is disabled (and not clickable) when disabled', async () => {
    const onToggle = vi.fn()
    render(<LookupToggle active={false} disabled onToggle={onToggle} />)
    const btn = screen.getByRole('button', { name: /lookup/i })
    expect(btn).toBeDisabled()
    await userEvent.click(btn)
    expect(onToggle).not.toHaveBeenCalled()
  })
})

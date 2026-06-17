// WI-9c — Settings · Sync disconnect dialog (design surface E): the two-way disconnect choice.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { DisconnectDialog } from './DisconnectDialog'

const setup = (overrides: Partial<React.ComponentProps<typeof DisconnectDialog>> = {}) => {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    serverUrl: 'https://lucid.myserver.dev',
    onConfirm: vi.fn(),
    ...overrides,
  }
  render(<DisconnectDialog {...props} />)
  return props
}

describe('DisconnectDialog', () => {
  it('renders the title and both choices when open', () => {
    setup()
    expect(screen.getByText(/disconnect sync\?/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /disconnect(?!.*erase)/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /erase server data/i })).toBeInTheDocument()
  })

  it('mentions the server URL in the erase choice', () => {
    setup()
    expect(screen.getByText(/lucid\.myserver\.dev/i)).toBeInTheDocument()
  })

  it('confirms with erase=false by default (keep choice pre-selected)', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()
    await user.click(screen.getByRole('button', { name: /^disconnect$/i }))
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('confirms with erase=true once the erase choice is selected', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()
    await user.click(screen.getByRole('radio', { name: /erase server data/i }))
    await user.click(screen.getByRole('button', { name: /^disconnect$/i }))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('Cancel closes the dialog without confirming', async () => {
    const user = userEvent.setup()
    const { onOpenChange, onConfirm } = setup()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByText(/disconnect sync\?/i)).toBeNull()
  })
})

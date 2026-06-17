// WI-9c — Settings · Sync connected panel (design surface C): server row, counts grid, disconnect zone.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { ConnectedPanel } from './ConnectedPanel'

const baseProps = {
  config: { serverUrl: 'https://lucid.myserver.dev', token: 'tok_secret_a4f2' },
  counts: { sessions: 12, tasks: 48, terms: 9, keywords: 23 },
  status: 'idle' as const,
  lastSyncedAt: null as number | null,
  queuedCount: 0,
  onSyncNow: vi.fn(),
  onRetry: vi.fn(),
  onShowConflict: vi.fn(),
  onUpdateToken: vi.fn(),
  onEdit: vi.fn(),
  onDisconnect: vi.fn(),
}

const setup = (overrides: Partial<typeof baseProps> = {}) => {
  const props = { ...baseProps, ...overrides }
  render(<ConnectedPanel {...props} />)
  return props
}

describe('ConnectedPanel', () => {
  it('shows the connected header badge and the server URL', () => {
    setup()
    expect(screen.getByText(/^connected$/i)).toBeInTheDocument()
    expect(screen.getByText('https://lucid.myserver.dev')).toBeInTheDocument()
  })

  it('redacts the token to the last 4 chars (never the full token)', () => {
    setup()
    expect(screen.getByText(/token …a4f2/i)).toBeInTheDocument()
    expect(screen.queryByText(/tok_secret_a4f2/)).toBeNull()
  })

  it('renders the data-scope counts grid', () => {
    setup()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('48')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  it('embeds the status card (idle → Synced) and wires Sync now', async () => {
    const onSyncNow = vi.fn()
    const user = userEvent.setup()
    setup({ onSyncNow, lastSyncedAt: Date.now() })
    expect(screen.getByText('Synced')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sync now/i }))
    expect(onSyncNow).toHaveBeenCalledOnce()
  })

  it('Edit fires onEdit', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    setup({ onEdit })
    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('the two disconnect buttons call onDisconnect(false) and onDisconnect(true)', async () => {
    const onDisconnect = vi.fn()
    const user = userEvent.setup()
    setup({ onDisconnect })
    await user.click(screen.getByRole('button', { name: /disconnect revert to local-only/i }))
    expect(onDisconnect).toHaveBeenLastCalledWith(false)
    await user.click(screen.getByRole('button', { name: /disconnect & erase/i }))
    expect(onDisconnect).toHaveBeenLastCalledWith(true)
  })
})

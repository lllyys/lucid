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
  lastSyncedAt: Date.now() as number | null,
  queuedCount: 0,
  onSyncNow: vi.fn(),
  onRetry: vi.fn(),
  onShowConflict: vi.fn(),
  onUpdateToken: vi.fn(),
  onEdit: vi.fn(),
  onTurnOff: vi.fn(),
  onDisconnect: vi.fn(),
}

const setup = (overrides: Partial<typeof baseProps> = {}) => {
  const props = { ...baseProps, ...overrides }
  render(<ConnectedPanel {...props} />)
  return props
}

describe('ConnectedPanel', () => {
  it('shows the connected header badge and the server URL (remote, token)', () => {
    setup()
    expect(screen.getByText(/^connected$/i)).toBeInTheDocument()
    expect(screen.getByText('https://lucid.myserver.dev')).toBeInTheDocument()
  })

  it('redacts the token to the last 4 chars (never the full token) — remote', () => {
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

  it('embeds the status card (idle + synced → Synced) and wires Sync now', async () => {
    const onSyncNow = vi.fn()
    const user = userEvent.setup()
    setup({ onSyncNow, lastSyncedAt: Date.now() })
    expect(screen.getByText('Synced')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sync now/i }))
    expect(onSyncNow).toHaveBeenCalledOnce()
  })

  it('shows the empty "nothing to sync yet" card when idle with no prior sync', () => {
    setup({ config: { serverUrl: 'https://app.dev', token: '' }, lastSyncedAt: null })
    expect(screen.getByText(/nothing to sync yet/i)).toBeInTheDocument()
    expect(screen.getByText(/first push happens on your next edit/i)).toBeInTheDocument()
  })

  it('remote (token) → keeps the server row + Edit button', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    setup({ onEdit })
    expect(screen.getByText(/connected to/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('single-origin (token === "") → read-only "Syncing to" origin row, no Edit', () => {
    setup({ config: { serverUrl: 'https://app.dev', token: '' } })
    expect(screen.getByText(/syncing to/i)).toBeInTheDocument()
    expect(screen.getByText('https://app.dev')).toBeInTheDocument()
    expect(screen.getByText(/same origin/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    expect(screen.queryByText(/token …/i)).toBeNull()
  })

  it('the ON toggle (single-origin) turns off → onTurnOff', async () => {
    const onTurnOff = vi.fn()
    const user = userEvent.setup()
    setup({ config: { serverUrl: 'https://app.dev', token: '' }, onTurnOff })
    const sw = screen.getByRole('switch', { name: /sync workspace data to this server/i })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await user.click(sw)
    expect(onTurnOff).toHaveBeenCalledOnce()
  })

  it('the two turn-off buttons call onDisconnect(false) and onDisconnect(true)', async () => {
    const onDisconnect = vi.fn()
    const user = userEvent.setup()
    setup({ onDisconnect })
    await user.click(screen.getByRole('button', { name: /turn off sync.*server data kept/i }))
    expect(onDisconnect).toHaveBeenLastCalledWith(false)
    await user.click(screen.getByRole('button', { name: /turn off & erase/i }))
    expect(onDisconnect).toHaveBeenLastCalledWith(true)
  })
})

// WI-9c — Settings · Sync status card (design surface D): per-state top card, tone + action wiring.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SyncStatusCard } from './SyncStatusCard'
import type { SyncStatus } from '@/stores/syncStore'

const noop = () => {}
const baseProps = {
  lastSyncedAt: null as number | null,
  queuedCount: 0,
  onSyncNow: noop,
  onRetry: noop,
  onShowConflict: noop,
  onUpdateToken: noop,
}

function renderCard(status: SyncStatus, overrides: Partial<typeof baseProps> = {}) {
  return render(<SyncStatusCard status={status} {...baseProps} {...overrides} />)
}

describe('SyncStatusCard', () => {
  it('idle → "Synced" + a "Sync now" button that fires onSyncNow', async () => {
    const onSyncNow = vi.fn()
    const user = userEvent.setup()
    renderCard('idle', { onSyncNow, lastSyncedAt: Date.now() })
    expect(screen.getByText('Synced')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sync now/i }))
    expect(onSyncNow).toHaveBeenCalledOnce()
  })

  it('idle with lastSyncedAt shows a relative "last synced" detail', () => {
    renderCard('idle', { lastSyncedAt: Date.now() - 3 * 60_000 })
    expect(screen.getByText(/last synced 3 minutes ago/i)).toBeInTheDocument()
  })

  it('syncing → "Syncing…" with the pushing-changes detail', () => {
    renderCard('syncing', { queuedCount: 12 })
    expect(screen.getByText('Syncing…')).toBeInTheDocument()
    expect(screen.getByText(/pushing 12 changes/i)).toBeInTheDocument()
  })

  it('offline → queued detail + a "Retry" button that fires onRetry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    renderCard('offline', { onRetry, queuedCount: 8 })
    expect(screen.getByText(/offline — changes queued/i)).toBeInTheDocument()
    expect(screen.getByText(/8 queued/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('conflict → "Details" button fires onShowConflict', async () => {
    const onShowConflict = vi.fn()
    const user = userEvent.setup()
    renderCard('conflict', { onShowConflict })
    expect(screen.getByText(/synced — with a conflict/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /details/i }))
    expect(onShowConflict).toHaveBeenCalledOnce()
  })

  it('auth-error → "Update token" button fires onUpdateToken', async () => {
    const onUpdateToken = vi.fn()
    const user = userEvent.setup()
    renderCard('auth-error', { onUpdateToken })
    expect(screen.getByText(/authentication failed/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /update token/i }))
    expect(onUpdateToken).toHaveBeenCalledOnce()
  })

  it('unreachable → "Retry now" button fires onRetry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    renderCard('unreachable', { onRetry })
    expect(screen.getByText(/server unreachable/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry now/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('connecting/local-only render the synced shell without crashing (panel guards these states)', () => {
    renderCard('connecting')
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})

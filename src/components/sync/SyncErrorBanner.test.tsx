// WI-9d — Sync error banner (design surface F): inline, non-blocking banners for the three actionable
// failure states (unreachable / auth-error / conflict). Reads the live syncStore status; renders nothing
// for every other state. Tests assert rendered (i18n) copy, ARIA button wiring, and the null states.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SyncErrorBanner } from './SyncErrorBanner'
import { useSyncStore, type SyncStatus } from '@/stores/syncStore'

beforeEach(() => {
  useSyncStore.getState().reset()
})

describe('SyncErrorBanner', () => {
  it('unreachable → renders the banner; "Retry now" fires onRetry', async () => {
    const onRetry = vi.fn()
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    useSyncStore.getState().setStatus('unreachable')
    render(<SyncErrorBanner onRetry={onRetry} onOpenSettings={onOpenSettings} />)
    expect(screen.getByText(/can't reach your sync server/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry now/i }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onOpenSettings).not.toHaveBeenCalled()
  })

  it('auth-error → renders the banner; "Update token" fires onOpenSettings', async () => {
    const onRetry = vi.fn()
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    useSyncStore.getState().setStatus('auth-error')
    render(<SyncErrorBanner onRetry={onRetry} onOpenSettings={onOpenSettings} />)
    expect(screen.getByText(/sync token rejected/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /update token/i }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('conflict → renders the banner; "Details" fires onOpenSettings', async () => {
    const onRetry = vi.fn()
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    useSyncStore.getState().setStatus('conflict')
    render(<SyncErrorBanner onRetry={onRetry} onOpenSettings={onOpenSettings} />)
    expect(screen.getByText(/an edit was superseded/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /details/i }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
    expect(onRetry).not.toHaveBeenCalled()
  })

  it.each<SyncStatus>(['local-only', 'connecting', 'idle', 'syncing', 'offline'])(
    'renders nothing for the non-banner state %s',
    (status) => {
      useSyncStore.getState().setStatus(status)
      const { container } = render(<SyncErrorBanner onRetry={() => {}} onOpenSettings={() => {}} />)
      expect(container).toBeEmptyDOMElement()
      expect(screen.queryByRole('button')).toBeNull()
    },
  )

  // WI-4 — at narrow widths the action button stacks full-width below the text (≥44px touch target).
  it('stacks the action full-width at narrow width (flex-col below 600)', () => {
    useSyncStore.getState().setStatus('unreachable')
    render(<SyncErrorBanner onRetry={() => {}} onOpenSettings={() => {}} />)
    const action = screen.getByRole('button', { name: /retry now/i })
    expect(action.className).toContain('max-[599px]:w-full')
    // The banner row stacks below 600 so the action drops under the text.
    const row = action.closest('div.flex')!
    expect(row.className).toContain('max-[599px]:flex-col')
  })
})

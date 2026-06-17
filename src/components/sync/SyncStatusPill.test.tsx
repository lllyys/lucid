// WI-9a — the sync status pill: renders the live status, localizes detail, and opens settings on click.
import { createRef } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SyncStatusPill } from './SyncStatusPill'
import { useSyncStore } from '@/stores/syncStore'

beforeEach(() => {
  useSyncStore.getState().reset()
})

describe('SyncStatusPill', () => {
  it('shows Local-only by default with the not-syncing hint', () => {
    render(<SyncStatusPill />)
    expect(screen.getByText('Local-only')).toBeInTheDocument()
    expect(screen.getByText('not syncing')).toBeInTheDocument()
  })

  it('reflects the synced (idle) state', () => {
    useSyncStore.getState().setStatus('idle')
    render(<SyncStatusPill />)
    expect(screen.getByText('Synced')).toBeInTheDocument()
  })

  it('reflects the connecting state (not drawn in the design pill row — verify the fill render)', () => {
    useSyncStore.getState().setStatus('connecting')
    render(<SyncStatusPill />)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
  })

  it('shows the queued count while syncing', () => {
    useSyncStore.getState().setStatus('syncing')
    useSyncStore.getState().setQueuedCount(12)
    render(<SyncStatusPill />)
    expect(screen.getByText('Syncing…')).toBeInTheDocument()
    expect(screen.getByText('12 changes')).toBeInTheDocument()
  })

  it('shows offline with the queued count', () => {
    useSyncStore.getState().setStatus('offline')
    useSyncStore.getState().setQueuedCount(8)
    render(<SyncStatusPill />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('8 queued')).toBeInTheDocument()
  })

  it('shows the conflict signal', () => {
    useSyncStore.getState().setStatus('conflict')
    render(<SyncStatusPill />)
    expect(screen.getByText('Conflict')).toBeInTheDocument()
    expect(screen.getByText('1 superseded')).toBeInTheDocument()
  })

  it('shows the auth-error and unreachable danger states', () => {
    useSyncStore.getState().setStatus('auth-error')
    const { rerender } = render(<SyncStatusPill />)
    expect(screen.getByText('Auth failed')).toBeInTheDocument()

    useSyncStore.getState().setStatus('unreachable')
    rerender(<SyncStatusPill />)
    expect(screen.getByText('Unreachable')).toBeInTheDocument()
    expect(screen.getByText('retrying')).toBeInTheDocument()
  })

  it('exposes an accessible name and opens settings on click', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<SyncStatusPill onOpenSettings={onOpenSettings} />)
    await user.click(screen.getByRole('button', { name: /sync status/i }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('forwards its ref to the underlying button (so it works as a Radix asChild dialog trigger)', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<SyncStatusPill ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })
})

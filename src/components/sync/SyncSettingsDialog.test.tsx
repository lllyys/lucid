// WI-9d — Settings · Sync dialog: a controlled shadcn Dialog whose trigger IS the SyncStatusPill and whose
// content wraps the SyncSettingsPanel. Tests assert the pill opens the panel and the controlled open/onChange
// contract is honored (behavior + ARIA, not internals).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SyncSettingsDialog } from './SyncSettingsDialog'
import { useSyncStore } from '@/stores/syncStore'
import type { SyncController } from '@/lib/sync/syncController'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

function makeController(overrides: Partial<SyncController> = {}): SyncController {
  return {
    connect: vi.fn(),
    connectSingleOrigin: vi.fn(),
    resume: vi.fn(),
    syncNow: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

beforeEach(() => {
  useSyncStore.getState().reset()
})

describe('SyncSettingsDialog', () => {
  it('clicking the pill opens the panel (local-only → the connect form)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<SyncSettingsDialog controller={makeController()} open={false} onOpenChange={onOpenChange} />)
    // closed → the panel content is not rendered
    expect(screen.queryByText(/connect a sync server/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: /sync status/i }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('when open, the SyncSettingsPanel content is shown', () => {
    render(<SyncSettingsDialog controller={makeController()} open onOpenChange={vi.fn()} />)
    expect(screen.getByText(/connect a sync server/i)).toBeInTheDocument()
  })

  it('exposes an accessible dialog title for screen readers', () => {
    render(<SyncSettingsDialog controller={makeController()} open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: /sync/i })).toBeInTheDocument()
  })

  it('honors the controlled contract — requesting a close calls onOpenChange(false)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<SyncSettingsDialog controller={makeController()} open onOpenChange={onOpenChange} />)
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

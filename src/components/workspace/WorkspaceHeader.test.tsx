import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/i18n'
import { WorkspaceHeader } from './WorkspaceHeader'
import type { SyncController } from '@/lib/sync/syncController'

// WI-2/WI-4 — the header reflow. Desktop shows the tagline + run hint; the compact (<960) bar drops
// them, centers the brand, and renders the ☰ drawer trigger on the left.
const controller = { resume: vi.fn(), syncNow: vi.fn() } as unknown as SyncController

function renderHeader(extra?: Partial<Parameters<typeof WorkspaceHeader>[0]>) {
  return render(
    <WorkspaceHeader
      controller={controller}
      syncSettingsOpen={false}
      onSyncSettingsChange={() => {}}
      {...extra}
    />,
  )
}

describe('WorkspaceHeader', () => {
  it('shows the tagline and run hint on desktop (default)', () => {
    renderHeader()
    expect(screen.getByText(/translate & polish/i)).toBeInTheDocument()
    expect(screen.getByText(/to run/i)).toBeInTheDocument()
  })

  it('drops the tagline + run hint and renders the drawer trigger when compact', () => {
    renderHeader({ compact: true, drawerTrigger: <button>my-hamburger</button> })
    expect(screen.queryByText(/translate & polish/i)).toBeNull()
    expect(screen.queryByText(/to run/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'my-hamburger' })).toBeInTheDocument()
    // The brand wordmark stays.
    expect(screen.getByText('Lucid')).toBeInTheDocument()
  })

  it('keeps the Settings affordance in the compact bar', () => {
    renderHeader({ compact: true })
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })
})

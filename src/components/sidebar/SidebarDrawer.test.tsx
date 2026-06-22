import { useState } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SidebarDrawer } from './SidebarDrawer'
import { useSessionStore } from '@/stores/sessionStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { OPEN_SETTINGS_EVENT } from '@/lib/workspace/openSettings'

// WI-2 — the off-canvas drawer (shadcn Sheet). The hamburger is the Sheet trigger; the Sheet owns
// focus-trap / Esc / scrim / scroll-lock / restore-focus-to-trigger. Opening a session closes it.
beforeEach(() => {
  useSessionStore.getState().reset()
  useGlossaryStore.getState().reset()
})

/** A controlled host so the test owns `open` and can assert close paths via onOpenChange. */
function Host() {
  const [open, setOpen] = useState(false)
  return <SidebarDrawer open={open} onOpenChange={setOpen} />
}

describe('SidebarDrawer', () => {
  it('opens the drawer from the hamburger and shows the sidebar content', async () => {
    const user = userEvent.setup()
    render(<Host />)
    // The hamburger trigger is labelled "Open menu".
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    expect(await screen.findByRole('tab', { name: 'Sessions' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Glossary' })).toBeInTheDocument()
  })

  it('renders the drawer brand and a close control + a Settings footer entry', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    // brand wordmark inside the drawer
    expect(await screen.findByText('Lucid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^settings$/i })).toBeInTheDocument()
  })

  it('closes on the × close control (Sheet restores focus to the trigger)', async () => {
    const user = userEvent.setup()
    render(<Host />)
    const trigger = screen.getByRole('button', { name: /open menu/i })
    await user.click(trigger)
    await screen.findByRole('tab', { name: 'Sessions' })
    await user.click(screen.getByRole('button', { name: /close menu/i }))
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Sessions' })).toBeNull())
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    await screen.findByRole('tab', { name: 'Sessions' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Sessions' })).toBeNull())
  })

  it('closes when a session is opened (activeSessionId changes)', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    await screen.findByRole('tab', { name: 'Sessions' })
    // Create + select a session from within the drawer's Sessions view → drawer closes.
    await user.click(screen.getByRole('button', { name: /new session/i }))
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Sessions' })).toBeNull())
  })

  it('fires the open-settings bridge from the drawer Settings footer', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpenSettings)
    render(<Host />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    await user.click(await screen.findByRole('button', { name: /^settings$/i }))
    expect(onOpenSettings).toHaveBeenCalled()
    window.removeEventListener(OPEN_SETTINGS_EVENT, onOpenSettings)
  })
})

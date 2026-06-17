// WI-9c — Settings · Sync panel composition: wires ConnectForm/ConnectedPanel/DisconnectDialog/ConflictCard
// to the syncStore + injected SyncController.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SyncSettingsPanel } from './SyncSettingsPanel'
import { useSyncStore } from '@/stores/syncStore'
import type { SyncController } from '@/lib/sync/syncController'

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }))

function makeController(overrides: Partial<SyncController> = {}): SyncController {
  return {
    connect: vi.fn(),
    resume: vi.fn(),
    syncNow: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

beforeEach(() => {
  useSyncStore.getState().reset()
  toastError.mockClear()
})

describe('SyncSettingsPanel', () => {
  it('local-only → renders the ConnectForm; submitting calls controller.connect', async () => {
    const controller = makeController()
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    expect(screen.getByText(/connect a sync server/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/server url/i), 'https://lucid.myserver.dev')
    await user.type(screen.getByLabelText(/access token/i), 'tok_abcd1234')
    await user.click(screen.getByRole('button', { name: /connect server/i }))
    expect(controller.connect).toHaveBeenCalledWith({ serverUrl: 'https://lucid.myserver.dev', token: 'tok_abcd1234' })
  })

  it('connected → renders the ConnectedPanel; Sync now calls controller.syncNow', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'idle' })
    const controller = makeController()
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    expect(screen.getByText(/^connected$/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sync now/i }))
    expect(controller.syncNow).toHaveBeenCalledOnce()
  })

  it('connected → shows the local-copy-kept and rev-authority reassurance notes (design surface C)', () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'idle' })
    render(<SyncSettingsPanel controller={makeController()} />)
    expect(screen.getByText(/local copy is always kept/i)).toBeInTheDocument()
    expect(screen.getByText(/ordering authority is the server-assigned rev/i)).toBeInTheDocument()
  })

  it('connecting → renders the connecting card, not the connected panel', () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'connecting' })
    render(<SyncSettingsPanel controller={makeController()} />)
    expect(screen.getByText(/connecting/i)).toBeInTheDocument()
    expect(screen.queryByText(/^connected$/i)).toBeNull() // not the connected panel yet
  })

  it('connecting → Cancel reverts to local-only without erasing', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'connecting' })
    const disconnect = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={makeController({ disconnect })} />)
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(disconnect).toHaveBeenCalledWith({ erase: false })
  })

  it('Disconnect (keep) opens the dialog → confirm calls controller.disconnect({ erase: false })', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'idle' })
    const disconnect = vi.fn().mockResolvedValue(true)
    const controller = makeController({ disconnect })
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('button', { name: /disconnect revert to local-only/i }))
    await user.click(screen.getByRole('button', { name: /^disconnect$/i })) // dialog confirm
    expect(disconnect).toHaveBeenCalledWith({ erase: false })
  })

  it('an erase that fails surfaces a localized toast (no invented banner)', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'idle' })
    const disconnect = vi.fn().mockResolvedValue(false) // purge failed
    const controller = makeController({ disconnect })
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('button', { name: /disconnect & erase/i }))
    // the zone "& erase" button pre-selects the erase choice in the dialog (no extra radio click needed)
    expect(screen.getByRole('radio', { name: /erase server data/i })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: /^disconnect$/i }))
    expect(disconnect).toHaveBeenCalledWith({ erase: true })
    expect(toastError).toHaveBeenCalledWith('Disconnected, but the server data could not be erased — try again later.')
  })

  it('conflict state → Details reveals the ConflictCard; Dismiss clears the store conflict', async () => {
    useSyncStore.setState({
      config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' },
      status: 'conflict',
      lastConflict: { type: 'term', id: 'glossary-99' },
    })
    const controller = makeController()
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.getByText(/a local edit was superseded/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(useSyncStore.getState().lastConflict).toBeNull()
  })

  it('Edit re-shows the ConnectForm prefilled with the current config', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://kept.dev', token: 'tok_keep99' }, status: 'idle' })
    const controller = makeController()
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByLabelText(/server url/i)).toHaveValue('https://kept.dev')
    expect(screen.getByLabelText(/access token/i)).toHaveValue('tok_keep99')
  })

  it('auth-error → Update token re-shows the ConnectForm prefilled (so a new token can be pasted)', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_old99' }, status: 'auth-error' })
    const controller = makeController()
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('button', { name: /update token/i }))
    expect(screen.getByLabelText(/server url/i)).toHaveValue('https://s.dev')
  })
})

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
    connectSingleOrigin: vi.fn(),
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
  it('local-only → renders the on/off toggle (not the URL+token form)', () => {
    render(<SyncSettingsPanel controller={makeController()} />)
    expect(screen.getByRole('switch', { name: /sync workspace data to this server/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/server url/i)).toBeNull() // advanced form is collapsed
  })

  it('local-only → toggling the switch on calls controller.connectSingleOrigin', async () => {
    const controller = makeController()
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('switch', { name: /sync workspace data to this server/i }))
    expect(controller.connectSingleOrigin).toHaveBeenCalledOnce()
    expect(controller.connect).not.toHaveBeenCalled()
  })

  it('local-only → Advanced disclosure reveals the ConnectForm; submit calls controller.connect (remote)', async () => {
    const controller = makeController()
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('button', { name: /use a different server/i }))
    await user.type(screen.getByLabelText(/server url/i), 'https://lucid.myserver.dev')
    await user.type(screen.getByLabelText(/access token/i), 'tok_abcd1234')
    await user.click(screen.getByRole('button', { name: /connect server/i }))
    expect(controller.connect).toHaveBeenCalledWith({ serverUrl: 'https://lucid.myserver.dev', token: 'tok_abcd1234' })
    expect(controller.connectSingleOrigin).not.toHaveBeenCalled()
  })

  it('connected (remote, token) → renders the ConnectedPanel; Sync now calls controller.syncNow', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'idle', lastSyncedAt: Date.now() })
    const controller = makeController()
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    expect(screen.getByText(/^connected$/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sync now/i }))
    expect(controller.syncNow).toHaveBeenCalledOnce()
  })

  it('connected single-origin (token === "") → read-only origin row, no Edit button', () => {
    useSyncStore.setState({ config: { serverUrl: 'https://app.dev', token: '' }, status: 'idle', lastSyncedAt: Date.now() })
    render(<SyncSettingsPanel controller={makeController()} />)
    expect(screen.getByText(/syncing to/i)).toBeInTheDocument()
    expect(screen.getByText('https://app.dev')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
  })

  it('connected single-origin → turning the ON toggle off opens the turn-off dialog', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://app.dev', token: '' }, status: 'idle', lastSyncedAt: Date.now() })
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={makeController()} />)
    await user.click(screen.getByRole('switch', { name: /sync workspace data to this server/i }))
    expect(screen.getByRole('radiogroup', { name: /turn off sync/i })).toBeInTheDocument()
  })

  it('empty · just turned on (idle + no prior sync) → shows the "nothing to sync yet" card', () => {
    useSyncStore.setState({ config: { serverUrl: 'https://app.dev', token: '' }, status: 'idle', lastSyncedAt: null })
    render(<SyncSettingsPanel controller={makeController()} />)
    expect(screen.getByText(/nothing to sync yet/i)).toBeInTheDocument()
    expect(screen.getByText(/first push happens on your next edit/i)).toBeInTheDocument()
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

  it('Turn off sync (keep) opens the dialog → confirm calls controller.disconnect({ erase: false })', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'idle', lastSyncedAt: Date.now() })
    const disconnect = vi.fn().mockResolvedValue(true)
    const controller = makeController({ disconnect })
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('button', { name: /turn off sync.*server data kept/i }))
    await user.click(screen.getByRole('button', { name: /^turn off$/i })) // dialog confirm
    expect(disconnect).toHaveBeenCalledWith({ erase: false })
  })

  it('an erase that fails surfaces a localized toast (no invented banner)', async () => {
    useSyncStore.setState({ config: { serverUrl: 'https://s.dev', token: 'tok_a4f2' }, status: 'idle', lastSyncedAt: Date.now() })
    const disconnect = vi.fn().mockResolvedValue(false) // purge failed
    const controller = makeController({ disconnect })
    const user = userEvent.setup()
    render(<SyncSettingsPanel controller={controller} />)
    await user.click(screen.getByRole('button', { name: /turn off & erase/i }))
    // the zone "& erase" button pre-selects the erase choice in the dialog (no extra radio click needed)
    expect(screen.getByRole('radio', { name: /erase server data/i })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: /^turn off$/i }))
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

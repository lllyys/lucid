// WI-6 — the E2E config-sync startup gate (design Sections A–D). Renders the right blocking card per
// `useConfigSyncStore.status` over a dimmed workspace, and wires each control to the injected
// ConfigSyncController. Tests drive a controlled store + a vi.fn controller and assert: the right card
// shows, actions fire the right controller method, error states swap the inline status, and unlocked /
// localOnly render the children (the workspace). Rule 65 §5: the passphrase is only passed to the
// controller, never logged/persisted by the UI.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { ConfigSyncGate } from './ConfigSyncGate'
import { useConfigSyncStore } from '@/lib/config/configSyncController'
import type { ConfigSyncController } from '@/lib/config/configSyncController'

function fakeController(): ConfigSyncController {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    setPassphrase: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    retrySync: vi.fn().mockResolvedValue(undefined),
    workLocalOnly: vi.fn(),
    dispose: vi.fn(),
  }
}

beforeEach(() => {
  useConfigSyncStore.getState().reset()
})

const child = <div data-testid="workspace">workspace</div>

describe('ConfigSyncGate', () => {
  it('calls init() on mount and dispose() on unmount', () => {
    const c = fakeController()
    const { unmount } = render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    expect(c.init).toHaveBeenCalledOnce()
    unmount()
    expect(c.dispose).toHaveBeenCalledOnce()
  })

  it('unlocked → renders the workspace (no card)', () => {
    useConfigSyncStore.getState().set({ status: 'unlocked' })
    render(<ConfigSyncGate controller={fakeController()}>{child}</ConfigSyncGate>)
    expect(screen.getByTestId('workspace')).toBeInTheDocument()
    expect(screen.queryByText(/unlock your config/i)).toBeNull()
  })

  it('localOnly → renders the workspace (no card)', () => {
    useConfigSyncStore.getState().set({ status: 'localOnly' })
    render(<ConfigSyncGate controller={fakeController()}>{child}</ConfigSyncGate>)
    expect(screen.getByTestId('workspace')).toBeInTheDocument()
  })

  it('unlocked + syncError → shows the Section-E banner; its Retry fires retrySync()', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'unlocked', syncError: 'configUnreachable' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    expect(screen.getByTestId('workspace')).toBeInTheDocument()
    expect(screen.getByText(/config server unreachable/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(c.retrySync).toHaveBeenCalledOnce()
  })

  it('unlocked without syncError → no banner', () => {
    useConfigSyncStore.getState().set({ status: 'unlocked', syncError: null })
    render(<ConfigSyncGate controller={fakeController()}>{child}</ConfigSyncGate>)
    expect(screen.queryByText(/config server unreachable/i)).toBeNull()
  })

  it('insecure → renders the insecure-context blocking card, hides the workspace', () => {
    useConfigSyncStore.getState().set({ status: 'insecure', error: 'insecureContext' })
    render(<ConfigSyncGate controller={fakeController()}>{child}</ConfigSyncGate>)
    expect(screen.getByText(/secure connection required/i)).toBeInTheDocument()
    expect(screen.getByText(/tailscale serve/i)).toBeInTheDocument()
    expect(screen.queryByTestId('workspace')).toBeNull()
  })

  it('noConfig → Set a passphrase opens the set card; Keep local fires workLocalOnly', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'noConfig' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    expect(screen.getByText(/no synced config yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /set a passphrase/i }))
    // The set-passphrase card is now shown.
    expect(screen.getByText(/encrypt & sync your config/i)).toBeInTheDocument()
  })

  it('noConfig → Keep working local-only fires workLocalOnly()', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'noConfig' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    await user.click(screen.getByRole('button', { name: /keep working local-only/i }))
    expect(c.workLocalOnly).toHaveBeenCalledOnce()
  })

  it('set-passphrase → Encrypt & enable sync calls setPassphrase(pass) when confirm matches', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'noConfig' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    await user.click(screen.getByRole('button', { name: /set a passphrase/i }))

    const [pass, confirm] = screen.getAllByLabelText(/passphrase/i)
    await user.type(pass, 'correct-horse-battery')
    await user.type(confirm, 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: /encrypt & enable sync/i }))
    expect(c.setPassphrase).toHaveBeenCalledWith('correct-horse-battery')
  })

  it('set-passphrase → submit is blocked while confirm does not match', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'noConfig' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    await user.click(screen.getByRole('button', { name: /set a passphrase/i }))

    const [pass, confirm] = screen.getAllByLabelText(/passphrase/i)
    await user.type(pass, 'abcdefgh')
    await user.type(confirm, 'different')
    await user.click(screen.getByRole('button', { name: /encrypt & enable sync/i }))
    expect(c.setPassphrase).not.toHaveBeenCalled()
  })

  it('set-passphrase → Not now fires workLocalOnly()', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'noConfig' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    await user.click(screen.getByRole('button', { name: /set a passphrase/i }))
    await user.click(screen.getByRole('button', { name: /not now/i }))
    expect(c.workLocalOnly).toHaveBeenCalledOnce()
  })

  it('locked → Unlock & load workspace calls unlock(pass)', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'locked' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    expect(screen.getByText(/unlock your config/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret')
    await user.click(screen.getByRole('button', { name: /unlock & load workspace/i }))
    expect(c.unlock).toHaveBeenCalledWith('my-secret')
  })

  it('locked → Show toggles the passphrase field between masked and revealed', async () => {
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'locked' })
    render(<ConfigSyncGate controller={fakeController()}>{child}</ConfigSyncGate>)
    const input = screen.getByLabelText(/passphrase/i) as HTMLInputElement
    expect(input.type).toBe('password')
    await user.click(screen.getByRole('button', { name: /show/i }))
    expect(input.type).toBe('text')
  })

  it('locked + wrongPassphraseOrCorrupt → shows the inline decrypt-failed status', () => {
    useConfigSyncStore.getState().set({ status: 'locked', error: 'wrongPassphraseOrCorrupt' })
    render(<ConfigSyncGate controller={fakeController()}>{child}</ConfigSyncGate>)
    expect(screen.getByText(/didn't decrypt the config/i)).toBeInTheDocument()
  })

  it('error + configUnreachable → Retry fires retry(); Work local-only fires workLocalOnly()', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'error', error: 'configUnreachable' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    expect(screen.getByText(/can't reach your config server/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry now/i }))
    expect(c.retry).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: /work local-only/i }))
    expect(c.workLocalOnly).toHaveBeenCalledOnce()
  })

  it('error + configRequestFailed → request-failed card; Retry fires retry()', async () => {
    const c = fakeController()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ status: 'error', error: 'configRequestFailed' })
    render(<ConfigSyncGate controller={c}>{child}</ConfigSyncGate>)
    expect(screen.getByText(/config request failed/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(c.retry).toHaveBeenCalledOnce()
  })

  it('checking → renders nothing blocking (quiet); workspace not yet shown', () => {
    useConfigSyncStore.getState().set({ status: 'checking' })
    render(<ConfigSyncGate controller={fakeController()}>{child}</ConfigSyncGate>)
    // No card and not yet the workspace (still probing).
    expect(screen.queryByText(/unlock your config/i)).toBeNull()
    expect(screen.queryByTestId('workspace')).toBeNull()
  })
})

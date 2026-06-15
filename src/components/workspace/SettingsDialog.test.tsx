import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SettingsDialog } from './SettingsDialog'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore, type PanelId } from '@/stores/operationStore'

beforeEach(() => {
  useProviderStore.getState().reset()
  ;(['translate', 'polish', 'draftTranslate'] as PanelId[]).forEach((p) => useOperationStore.getState().reset(p))
})

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /settings/i }))
}

describe('SettingsDialog', () => {
  it('opens the provider/key dialog from the Settings button', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog />)
    expect(screen.queryByText(/providers & keys/i)).toBeNull()
    await open(user)
    expect(screen.getByText(/providers & keys/i)).toBeInTheDocument()
  })

  it('lists only implemented providers (Anthropic), not unimplemented ones', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog />)
    await open(user)
    expect(screen.getAllByText('Anthropic').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('OpenAI')).toBeNull()
    expect(screen.queryByText('Google')).toBeNull()
  })

  it('saves a valid key and shows it masked with a saved badge', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog />)
    await open(user)
    await user.type(screen.getByLabelText(/api key/i), 'sk-ant-api03-abcd1234')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(useProviderStore.getState().apiKey).toBe('sk-ant-api03-abcd1234')
    expect(screen.getByText('sk-…1234')).toBeInTheDocument()
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('reveal toggles the key input between password and text', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog />)
    await open(user)
    const input = screen.getByLabelText(/api key/i)
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show/i }))
    expect(input).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: /hide/i }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('rejects a wrong-shaped key with a visible hint and does not save it', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog />)
    await open(user)
    await user.type(screen.getByLabelText(/api key/i), 'not-a-real-key')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(useProviderStore.getState().apiKey).toBe('')
  })

  it('saving a new key while a panel streams aborts that panel (no stale-credential stream)', async () => {
    useOperationStore.setState({
      translate: { status: 'streaming', text: 'partial', startedAt: 0, elapsedMs: null, runId: 1 },
    })
    const user = userEvent.setup()
    render(<SettingsDialog />)
    await open(user)
    await user.type(screen.getByLabelText(/api key/i), 'sk-ant-api03-zzzz9999')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(useOperationStore.getState().translate.status).toBe('cancelled')
  })

  it('clears the key and removes the saved row', async () => {
    useProviderStore.getState().setApiKey('sk-ant-api03-abcd1234')
    const user = userEvent.setup()
    render(<SettingsDialog />)
    await open(user)
    expect(screen.getByText('sk-…1234')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(useProviderStore.getState().apiKey).toBe('')
    expect(screen.queryByText('sk-…1234')).toBeNull()
  })

  it('shows a rejected hint when a panel reports an invalidKey for the active provider', async () => {
    vi.useRealTimers()
    useProviderStore.getState().setApiKey('sk-ant-api03-abcd1234')
    useOperationStore.setState({
      translate: {
        status: 'error',
        text: '',
        error: { kind: 'invalidKey', messageKey: 'error.invalidKey', retryable: false },
        startedAt: null,
        elapsedMs: null,
        runId: 1,
      },
    })
    const user = userEvent.setup()
    render(<SettingsDialog />)
    await open(user)
    expect(screen.getByRole('alert')).toHaveTextContent(/rejected/i)
  })
})

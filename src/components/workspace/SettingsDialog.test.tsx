import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SettingsDialog } from './SettingsDialog'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore, type PanelId } from '@/stores/operationStore'
import { streamResponse } from '@/test/providerTestUtils'

beforeEach(() => {
  useProviderStore.getState().reset()
  ;(['translate', 'polish', 'draftTranslate'] as PanelId[]).forEach((p) => useOperationStore.getState().reset(p))
})
afterEach(() => vi.unstubAllGlobals())

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /settings/i }))
}
const setup = async () => {
  const user = userEvent.setup()
  render(<SettingsDialog />)
  await open(user)
  return user
}

describe('SettingsDialog', () => {
  it('opens the provider surface from the Settings button', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog />)
    expect(screen.queryByText(/providers · models · keys/i)).toBeNull()
    await open(user)
    expect(screen.getByText(/providers · models · keys/i)).toBeInTheDocument()
  })

  it('lists every configurable provider as a rail row — incl. Custom (#5/#7/#29)', async () => {
    await setup()
    // OpenAI/Google/Local/Custom appear only as rail rows on open (Anthropic is viewed) → unique buttons.
    for (const label of ['OpenAI', 'Google', 'Local', 'Custom']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
    expect(screen.getAllByText('Anthropic').length).toBeGreaterThanOrEqual(1) // rail row + viewed header
  })

  // ---- active-vendor (Anthropic) credential behaviors (feature #4, preserved) ----
  it('saves a valid key for the active vendor and shows it masked + a saved badge', async () => {
    const user = await setup()
    await user.type(screen.getByLabelText(/api key/i), 'sk-ant-api03-abcd1234')
    await user.click(screen.getByRole('button', { name: /save anthropic/i }))
    expect(useProviderStore.getState().apiKey).toBe('sk-ant-api03-abcd1234')
    expect(screen.getByText('sk-…1234')).toBeInTheDocument()
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('reveal toggles the key input between password and text', async () => {
    const user = await setup()
    const input = screen.getByLabelText(/api key/i)
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show/i }))
    expect(input).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: /hide/i }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('rejects a wrong-shaped key with a visible hint and does not save it', async () => {
    const user = await setup()
    await user.type(screen.getByLabelText(/api key/i), 'not-a-real-key')
    await user.click(screen.getByRole('button', { name: /save anthropic/i }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(useProviderStore.getState().apiKey).toBe('')
  })

  it('saving a new key while a panel streams aborts that panel (no stale-credential stream)', async () => {
    useOperationStore.setState({
      translate: { status: 'streaming', text: 'partial', startedAt: 0, elapsedMs: null, runId: 1 },
    })
    const user = await setup()
    await user.type(screen.getByLabelText(/api key/i), 'sk-ant-api03-zzzz9999')
    await user.click(screen.getByRole('button', { name: /save anthropic/i }))
    expect(useOperationStore.getState().translate.status).toBe('cancelled')
  })

  it('clears the active key and removes the saved row', async () => {
    useProviderStore.getState().setApiKey('sk-ant-api03-abcd1234')
    const user = await setup()
    expect(screen.getByText('sk-…1234')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(useProviderStore.getState().apiKey).toBe('')
    expect(screen.queryByText('sk-…1234')).toBeNull()
  })

  it('shows a "rejected" hint when the active provider has a runtime invalidKey, and clears it on a new key', async () => {
    useProviderStore.getState().setApiKey('sk-ant-api03-bad00000')
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
    const user = await setup()
    expect(screen.getByRole('alert')).toHaveTextContent(/rejected/i)
    await user.type(screen.getByLabelText(/api key/i), 'sk-ant-api03-good11111')
    await user.click(screen.getByRole('button', { name: /save anthropic/i }))
    expect(useOperationStore.getState().translate.status).toBe('idle')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // ---- multi-provider behaviors (#5 WI-6a) ----
  it('switches the VIEWED provider without changing the active one, with per-vendor key isolation', async () => {
    useProviderStore.getState().setApiKey('sk-ant-api03-abcd1234') // anthropic key
    const user = await setup()
    expect(screen.getByText('sk-…1234')).toBeInTheDocument() // anthropic's masked key shown
    await user.click(screen.getByRole('button', { name: /openai/i }))
    expect(useProviderStore.getState().vendor).toBe('anthropic') // active unchanged by viewing OpenAI
    expect(screen.queryByText('sk-…1234')).toBeNull() // OpenAI has no key — isolation
  })

  it('saves a key for a NON-active viewed vendor without switching the active one', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /openai/i }))
    await user.type(screen.getByLabelText(/api key/i), 'sk-openai-abcd1234')
    await user.click(screen.getByRole('button', { name: /save openai/i }))
    expect(useProviderStore.getState().apiKeys.openai).toBe('sk-openai-abcd1234')
    expect(useProviderStore.getState().vendor).toBe('anthropic') // still active anthropic
  })

  it('"Use for this workspace" makes the viewed provider active', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /openai/i }))
    await user.click(screen.getByRole('button', { name: /use for this workspace/i }))
    expect(useProviderStore.getState().vendor).toBe('openai')
  })

  it('Local (Ollama) shows the no-key card and offers no API-key input', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /local/i }))
    expect(screen.getByText(/no key needed/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/api key/i)).toBeNull()
  })

  it('Custom shows a base-URL field (saving stores it) plus an OPTIONAL key field', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /custom/i }))
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'https://my-host.example.com/v1')
    await user.click(screen.getByRole('button', { name: /save base url/i }))
    expect(useProviderStore.getState().baseUrl).toBe('https://my-host.example.com/v1')
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument() // optional key field present
  })

  it('model picker selects a model for the viewed vendor (dropdown — named vendor)', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Model' }))
    await user.click(await screen.findByRole('menuitem', { name: /claude-opus-4-8/i }))
    expect(useProviderStore.getState().models.anthropic).toBe('claude-opus-4-8')
  })

  it('custom uses a free-text model input (no fixed catalog)', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /custom/i }))
    await user.type(screen.getByRole('textbox', { name: 'Model' }), 'my-model')
    expect(useProviderStore.getState().models.custom).toBe('my-model')
  })

  it('does NOT show the "rejected" hint on a NON-active viewed vendor', async () => {
    useProviderStore.getState().setApiKey('sk-ant-api03-bad00000')
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
    const user = await setup()
    expect(screen.getByRole('alert')).toHaveTextContent(/rejected/i) // active anthropic shows it
    await user.click(screen.getByRole('button', { name: /openai/i })) // view a NON-active vendor
    expect(screen.queryByRole('alert')).toBeNull() // hint is scoped to the active provider only
  })

  it('clears a NON-active viewed vendor key via clearKey(vendor), leaving the active one untouched', async () => {
    useProviderStore.getState().setApiKey('sk-openai-abcd1234', 'openai')
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /openai/i }))
    expect(screen.getByText('sk-…1234')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(useProviderStore.getState().apiKeys.openai).toBe('')
    expect(useProviderStore.getState().vendor).toBe('anthropic') // active never switched
  })

  // ---- test-connection panel (#6 WI-6b) ----
  it('Test connection on a keyless provider shows the pre-check failure (no network call)', async () => {
    const user = await setup() // anthropic viewed, no key
    await user.click(screen.getByRole('button', { name: /test connection/i }))
    expect(screen.getByText(/add an api key first/i)).toBeInTheDocument()
  })

  it('Test connection reports Connected against a reachable (mocked) endpoint', async () => {
    useProviderStore.getState().setApiKey('sk-ant-api03-abcd1234')
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'pong' } })}\n\n`,
          `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /test connection/i }))
    expect(await screen.findByText(/connected/i)).toBeInTheDocument()
  })
})

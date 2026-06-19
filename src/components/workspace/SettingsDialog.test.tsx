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

  // Regression for bug #90: the dialog's 880px width override must be `sm:`-scoped so tailwind-merge
  // reconciles it with the shared DialogContent base's `sm:max-w-lg` (same variant → caller wins). An
  // unprefixed `max-w-[880px]` does NOT defeat `sm:max-w-lg`, so the dialog clamped to 512px and the
  // right pane was clipped. This guards against a revert to the unprefixed form (or a base regression).
  it('applies the 880px width as sm:max-w-[880px], dropping the base sm:max-w-lg (bug #90)', async () => {
    await setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('sm:max-w-[880px]')
    expect(dialog.className).not.toContain('sm:max-w-lg')
  })

  it('lists every BUILT-IN provider as a rail row + a Custom group CTA (#10 WI-3)', async () => {
    await setup()
    // Built-ins appear as rail rows (Anthropic is viewed → also a header). The legacy static "Custom"
    // row is gone — the Custom group now offers an "Add custom provider" CTA instead.
    for (const label of ['OpenAI', 'Google', 'Local']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
    expect(screen.getAllByText('Anthropic').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/custom providers/i)).toBeInTheDocument() // group header (empty state)
    expect(screen.getByRole('button', { name: /add custom provider/i })).toBeInTheDocument()
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
      translate: { status: 'streaming', text: 'partial', startedAt: 0, elapsedMs: null, runId: 1, isAuto: false },
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
        isAuto: false,
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

  it('model picker selects a model for the viewed vendor (dropdown — named vendor)', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Model' }))
    await user.click(await screen.findByRole('menuitem', { name: /claude-opus-4-8/i }))
    expect(useProviderStore.getState().models.anthropic).toBe('claude-opus-4-8')
  })

  // ---- custom providers, the new one→many model (#10 WI-3) ----
  it('Add custom provider opens the add form; a valid endpoint creates a custom (addCustomProvider)', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /add custom provider/i }))
    await user.type(screen.getByRole('textbox', { name: /label/i }), 'Together AI')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'https://api.together.xyz/v1')
    await user.type(screen.getByRole('textbox', { name: /^model$/i }), 'Qwen2.5-72B')
    await user.click(screen.getByRole('button', { name: /add provider/i }))
    const customs = Object.values(useProviderStore.getState().customProviders)
    expect(customs).toHaveLength(1)
    expect(customs[0]).toMatchObject({ label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', model: 'Qwen2.5-72B' })
  })

  it('the populated rail shows Custom · N and a row per custom provider', async () => {
    useProviderStore.getState().addCustomProvider({ label: 'Together AI', baseUrl: 'https://h/v1', model: 'q' })
    useProviderStore.getState().addCustomProvider({ label: 'Office gateway', baseUrl: 'https://gw/v1', model: 'm' })
    await setup()
    expect(screen.getByText(/custom · 2/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /together ai/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /office gateway/i })).toBeInTheDocument()
  })

  it('"Use for this workspace" on a custom activates it via setVendor({type:custom,id}) and shows its label', async () => {
    const id = useProviderStore.getState().addCustomProvider({ label: 'Together AI', baseUrl: 'https://h/v1', model: 'q' })
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /together ai/i }))
    await user.click(screen.getByRole('button', { name: /use for this workspace/i }))
    expect(useProviderStore.getState().vendor).toBe('custom')
    expect(useProviderStore.getState().activeCustomId).toBe(id)
    // The viewed header reflects the custom's own label (activePresentation), not the static "Custom".
    expect(screen.getAllByText('Together AI').length).toBeGreaterThanOrEqual(1)
  })

  it('editing a custom row patches it via updateCustomProvider', async () => {
    const id = useProviderStore.getState().addCustomProvider({ label: 'Together AI', baseUrl: 'https://h/v1', model: 'q' })
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /together ai/i }))
    const labelInput = screen.getByRole('textbox', { name: /label/i })
    await user.clear(labelInput)
    await user.type(labelInput, 'Together v2')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(useProviderStore.getState().customProviders[id].label).toBe('Together v2')
  })

  it('the add form blocks a duplicate label (Add disabled, error shown)', async () => {
    useProviderStore.getState().addCustomProvider({ label: 'Together AI', baseUrl: 'https://h/v1', model: 'q' })
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /add custom provider/i }))
    await user.type(screen.getByRole('textbox', { name: /label/i }), 'together ai') // case-insensitive dupe
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'https://h2/v1')
    await user.type(screen.getByRole('textbox', { name: /^model$/i }), 'm')
    expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add provider/i })).toBeDisabled()
  })

  it('a per-custom Test connection records the outcome on THAT custom (custom-id-aware)', async () => {
    const id = useProviderStore.getState().addCustomProvider({ label: 'Together AI', baseUrl: 'https://h/v1', model: 'q', key: 'sk-x' })
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'pong' } }] })}\n\n`,
          'data: [DONE]\n\n',
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /together ai/i }))
    await user.click(screen.getByRole('button', { name: /test connection/i }))
    // The connection card shows "Connected"; the rail status line also flips to "Connected" → ≥2.
    expect((await screen.findAllByText(/connected/i)).length).toBeGreaterThanOrEqual(1)
    expect(useProviderStore.getState().customProviders[id].testResult.status).toBe('ok')
  })

  it('removing a non-active custom is a quiet one-step delete after confirm', async () => {
    const id = useProviderStore.getState().addCustomProvider({ label: 'Office gateway', baseUrl: 'https://gw/v1', model: 'm' })
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /office gateway/i }))
    await user.click(screen.getByRole('button', { name: /^remove$/i })) // open the confirm
    await user.click(screen.getByRole('button', { name: /remove provider/i })) // confirm
    expect(useProviderStore.getState().customProviders[id]).toBeUndefined()
  })

  it('removing the ACTIVE custom shows the fallback notice and falls back to a built-in', async () => {
    const id = useProviderStore.getState().addCustomProvider({ label: 'Office gateway', baseUrl: 'https://gw/v1', model: 'm' })
    useProviderStore.getState().setVendor({ type: 'custom', id })
    const user = await setup()
    await user.click(screen.getByRole('button', { name: /office gateway/i }))
    await user.click(screen.getByRole('button', { name: /^remove$/i }))
    expect(screen.getByText(/active provider/i)).toBeInTheDocument() // fallback notice
    await user.click(screen.getByRole('button', { name: /remove provider/i }))
    expect(useProviderStore.getState().vendor).toBe('anthropic') // fell back
    expect(useProviderStore.getState().activeCustomId).toBeNull()
  })

  it('a previously-keyed custom shows needs-key after reload (key was not persisted — §5)', async () => {
    // Simulate a rehydrated custom: baseUrl + model present, key stripped (the persist path strips it).
    const id = useProviderStore.getState().addCustomProvider({ label: 'Office gateway', baseUrl: 'https://gw/v1', model: 'gpt-4o-mini' })
    useProviderStore.getState().clearKey(undefined, id) // key === '' (the post-reload state)
    await setup()
    // The rail row's status line shows the needs-key state for a keyed-but-now-keyless custom.
    expect(screen.getByText(/needs key/i)).toBeInTheDocument()
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
        isAuto: false,
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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { ProviderSwitcher } from './ProviderSwitcher'
import { useProviderStore } from '@/stores/providerStore'
import { __resetCustomIds, __useRandomCustomIds } from '@/stores/providerStoreMigrate'
import { OPEN_SETTINGS_EVENT } from '@/lib/workspace/openSettings'

/** Seed a ready custom (baseUrl + model + key + an ok testResult) so its dot/ready state is realistic. */
function seedReadyCustom(label: string, model: string): string {
  const id = useProviderStore.getState().addCustomProvider({
    label,
    baseUrl: 'https://api.example.test/v1',
    model,
    key: 'sk-test',
  })
  useProviderStore.getState().setTestResult('custom', { status: 'ok', latencyMs: 10 }, id)
  return id
}

beforeEach(() => {
  __resetCustomIds() // deterministic c1, c2, … ids for stable assertions
  useProviderStore.getState().reset()
})

describe('ProviderSwitcher', () => {
  it('shows the active built-in provider on the trigger', () => {
    render(<ProviderSwitcher />)
    expect(screen.getByRole('button', { name: /anthropic/i })).toBeInTheDocument()
    __useRandomCustomIds()
  })

  // The trigger resolves the active target via activePresentation(state): an active custom shows ITS
  // OWN label (not the generic "Custom"). Subsumes the old bug #3 mislabel (was: silent fall-back to
  // the first list entry, Anthropic; then the static "Custom" — now the custom's real label).
  it('shows the active custom’s OWN label on the trigger — not "Custom" or "Anthropic"', () => {
    const id = seedReadyCustom('Together AI', 'Qwen2.5-72B')
    useProviderStore.getState().setVendor({ type: 'custom', id })
    render(<ProviderSwitcher />)
    expect(screen.getByRole('button', { name: /together ai/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^anthropic$/i })).toBeNull()
    __useRandomCustomIds()
  })

  // design Section E: when the active custom isn't ready, the collapsed trigger carries a status chip
  // so the warning is visible without opening the menu.
  it('carries a "needs key" status chip on the trigger when the active custom hasn’t been tested', () => {
    const id = useProviderStore.getState().addCustomProvider({
      label: 'Office gateway',
      baseUrl: 'https://gw.example.test/v1',
      model: 'gpt-4o-mini',
      // no key, untested → "needs key" per the rail-status helper
    })
    useProviderStore.getState().setVendor({ type: 'custom', id })
    render(<ProviderSwitcher />)
    expect(screen.getByRole('button', { name: /office gateway/i })).toHaveTextContent(/needs key/i)
    __useRandomCustomIds()
  })

  it('does NOT show a status chip on the trigger for a connected custom', () => {
    const id = seedReadyCustom('Together AI', 'Qwen2.5-72B')
    useProviderStore.getState().setVendor({ type: 'custom', id })
    render(<ProviderSwitcher />)
    expect(screen.getByRole('button', { name: /together ai/i })).not.toHaveTextContent(/needs key/i)
    __useRandomCustomIds()
  })

  it('lists the built-in named vendors AND each custom provider, grouped (design Section E)', async () => {
    const user = userEvent.setup()
    seedReadyCustom('Together AI', 'Qwen2.5-72B')
    seedReadyCustom('Local vLLM', 'mixtral-8x7b')
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    expect(await screen.findByRole('menuitem', { name: /anthropic/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /openai/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /together ai/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /local vllm/i })).toBeInTheDocument()
    __useRandomCustomIds()
  })

  it('selecting a built-in calls setVendor(vendor) and clears the active custom', async () => {
    const user = userEvent.setup()
    const id = seedReadyCustom('Together AI', 'Qwen2.5-72B')
    useProviderStore.getState().setVendor({ type: 'custom', id })
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /together ai/i }))
    await user.click(await screen.findByRole('menuitem', { name: /openai/i }))
    expect(useProviderStore.getState().vendor).toBe('openai')
    expect(useProviderStore.getState().activeCustomId).toBeNull()
    __useRandomCustomIds()
  })

  // The load-bearing fix: selecting a custom routes through setVendor({type:'custom',id}) — NEVER the
  // bare setVendor('custom') string that strands activeCustomId (the WI-1 audit regression).
  it('selecting a custom sets vendor=custom + activeCustomId + isReady (NOT the bare custom string)', async () => {
    const user = userEvent.setup()
    const id = seedReadyCustom('Together AI', 'Qwen2.5-72B')
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    await user.click(await screen.findByRole('menuitem', { name: /together ai/i }))
    const s = useProviderStore.getState()
    expect(s.vendor).toBe('custom')
    expect(s.activeCustomId).toBe(id)
    expect(s.isReady()).toBe(true)
    __useRandomCustomIds()
  })

  it('reflects each built-in vendor’s selected model in the menu, not just the registry default (#5 WI-7)', async () => {
    useProviderStore.getState().setModel('claude-opus-4-8', 'anthropic')
    const user = userEvent.setup()
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    expect(await screen.findByRole('menuitem', { name: /claude-opus-4-8/i })).toBeInTheDocument()
    __useRandomCustomIds()
  })

  it('shows each custom’s selected model as its sub-label in the menu', async () => {
    const user = userEvent.setup()
    seedReadyCustom('Together AI', 'Qwen2.5-72B')
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    expect(await screen.findByRole('menuitem', { name: /qwen2\.5-72b/i })).toBeInTheDocument()
    __useRandomCustomIds()
  })

  it('opens Settings when "Add custom provider…" is chosen (design Section E)', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen)
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    await user.click(await screen.findByRole('menuitem', { name: /add custom provider/i }))
    expect(onOpen).toHaveBeenCalledOnce()
    window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen)
    __useRandomCustomIds()
  })

  // Edge: a dangling active custom (vendor='custom' but activeCustomId points at nothing) must not
  // crash — activePresentation falls back to the static "Custom" presentation.
  it('falls back gracefully when the active custom id is dangling', () => {
    useProviderStore.setState({ vendor: 'custom', activeCustomId: 'ghost', customProviders: {} })
    render(<ProviderSwitcher />)
    expect(screen.getByRole('button', { name: /custom/i })).toBeInTheDocument()
    __useRandomCustomIds()
  })
})

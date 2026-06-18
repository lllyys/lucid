import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { ProviderSwitcher } from './ProviderSwitcher'
import { useProviderStore } from '@/stores/providerStore'

beforeEach(() => {
  useProviderStore.getState().reset()
})

describe('ProviderSwitcher', () => {
  it('shows the active provider on the trigger', () => {
    render(<ProviderSwitcher />)
    expect(screen.getByRole('button', { name: /anthropic/i })).toBeInTheDocument()
  })

  // Regression for bug #3: when the active vendor is `custom` (not in the switcher list, which
  // excludes custom), the trigger must show "Custom" — not silently fall back to the first list
  // entry (Anthropic). The footer already says runs go to Custom; the switcher label must agree.
  it('shows Custom on the trigger when Custom is the active provider (bug #3)', () => {
    useProviderStore.getState().setVendor('custom')
    render(<ProviderSwitcher />)
    expect(screen.getByRole('button', { name: /custom/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /anthropic/i })).toBeNull()
  })

  // Locks in the split the fix depends on: the trigger uses presentationFor() (so Custom shows),
  // but the dropdown LIST still uses implementedPresentations() (named vendors only — no Custom
  // row). Guards against a future "fix" that adds Custom to the list (rule 51 — Settings owns it).
  it('keeps the dropdown to named vendors only — no Custom row — while Custom is active (bug #3)', async () => {
    const user = userEvent.setup()
    useProviderStore.getState().setVendor('custom')
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /custom/i }))
    expect(await screen.findByRole('menuitem', { name: /anthropic/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /openai/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /custom/i })).toBeNull()
  })

  it('lists the implemented named vendors and switches the active provider on select (#5)', async () => {
    const user = userEvent.setup()
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    expect(await screen.findByRole('menuitem', { name: /anthropic/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /openai/i })).toBeInTheDocument() // now implemented (#5 WI-4)
    await user.click(screen.getByRole('menuitem', { name: /openai/i }))
    expect(useProviderStore.getState().vendor).toBe('openai')
  })

  it('reflects each vendor’s selected model in the menu, not just the registry default (#5 WI-7)', async () => {
    useProviderStore.getState().setModel('claude-opus-4-8', 'anthropic')
    const user = userEvent.setup()
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    expect(await screen.findByRole('menuitem', { name: /claude-opus-4-8/i })).toBeInTheDocument()
  })
})

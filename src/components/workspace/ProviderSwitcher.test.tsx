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

  it('lists only implemented vendors and keeps Anthropic active on select', async () => {
    const user = userEvent.setup()
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    expect(await screen.findByRole('menuitem', { name: /anthropic/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /openai/i })).toBeNull() // unimplemented → absent (rule 51)
    await user.click(screen.getByRole('menuitem', { name: /anthropic/i }))
    expect(useProviderStore.getState().vendor).toBe('anthropic')
  })
})

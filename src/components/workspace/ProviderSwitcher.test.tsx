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

  it('lists the implemented named vendors and switches the active provider on select (#5)', async () => {
    const user = userEvent.setup()
    render(<ProviderSwitcher />)
    await user.click(screen.getByRole('button', { name: /anthropic/i }))
    expect(await screen.findByRole('menuitem', { name: /anthropic/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /openai/i })).toBeInTheDocument() // now implemented (#5 WI-4)
    await user.click(screen.getByRole('menuitem', { name: /openai/i }))
    expect(useProviderStore.getState().vendor).toBe('openai')
  })
})

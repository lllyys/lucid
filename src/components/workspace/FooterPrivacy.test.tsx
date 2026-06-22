import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { FooterPrivacy } from './FooterPrivacy'
import { useProviderStore } from '@/stores/providerStore'
import { OPEN_SETTINGS_EVENT } from '@/lib/workspace/openSettings'

beforeEach(() => {
  useProviderStore.getState().reset()
})

describe('FooterPrivacy', () => {
  it('shows the hosted privacy line for a hosted provider', () => {
    render(<FooterPrivacy />)
    expect(screen.getByText(/sent to anthropic/i)).toBeInTheDocument()
  })

  it('shows the local privacy line when a local provider is active', () => {
    act(() => {
      useProviderStore.setState({ vendor: 'ollama' })
    })
    render(<FooterPrivacy />)
    expect(screen.getByText(/stays on this device/i)).toBeInTheDocument()
  })

  // WI-4 — the privacy text truncates (min-w-0 + truncate) and a "Details" CTA opens the Settings
  // provider dialog (the real where-your-text-goes surface) via the openSettings bridge (audit H6/L1).
  it('truncates the privacy text so the Details CTA never wraps off-screen', () => {
    render(<FooterPrivacy />)
    expect(screen.getByText(/sent to anthropic/i).className).toContain('truncate')
  })

  it('fires the open-settings bridge from the Details CTA', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpenSettings)
    render(<FooterPrivacy />)
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(onOpenSettings).toHaveBeenCalled()
    window.removeEventListener(OPEN_SETTINGS_EVENT, onOpenSettings)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { FooterPrivacy } from './FooterPrivacy'
import { useProviderStore } from '@/stores/providerStore'
import { useSyncStore } from '@/stores/syncStore'
import { setProxyAllowlist, clearProxyAllowlist } from '@/lib/providers/proxyAllowlist'
import { OPEN_SETTINGS_EVENT } from '@/lib/workspace/openSettings'

beforeEach(() => {
  useProviderStore.getState().reset()
  useSyncStore.getState().reset()
  clearProxyAllowlist()
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

  // #28 — a token-free single-origin, allow-listed custom provider is relayed through the server, so
  // the privacy line names the relay ("via this server") instead of the plain "sent to X".
  it('names the relay when the active custom provider is proxied through the server (#28)', () => {
    act(() => {
      const s = useProviderStore.getState()
      const id = s.addCustomProvider({ label: 'Local', baseUrl: 'http://100.80.151.31:8000/v1', model: 'cm' })
      s.setVendor({ type: 'custom', id })
      useSyncStore.setState({ config: { serverUrl: window.location.origin, token: '' } })
      setProxyAllowlist(['http://100.80.151.31:8000/v1'])
    })
    render(<FooterPrivacy />)
    expect(screen.getByText(/via this server/i)).toBeInTheDocument()
  })

  it('shows the plain hosted line for a custom provider that is NOT proxied (unlisted / local-only)', () => {
    act(() => {
      const s = useProviderStore.getState()
      const id = s.addCustomProvider({ label: 'Local', baseUrl: 'http://100.80.151.31:8000/v1', model: 'cm' })
      s.setVendor({ type: 'custom', id }) // no sync config → not single-origin → direct
    })
    render(<FooterPrivacy />)
    expect(screen.queryByText(/via this server/i)).not.toBeInTheDocument()
    expect(screen.getByText(/sent to/i)).toBeInTheDocument()
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

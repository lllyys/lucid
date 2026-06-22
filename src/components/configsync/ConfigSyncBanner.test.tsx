// WI-6 — the NON-blocking config-sync banner (design Section E). Driven by `useConfigSyncStore.syncError`
// (a background save failure once unlocked); renders nothing when syncError is null. Its retry fires the
// injected onRetry (the app wires it to controller.retrySync()). Tests assert copy, the null state, and
// the retry wiring.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { ConfigSyncBanner } from './ConfigSyncBanner'
import { useConfigSyncStore } from '@/lib/config/configSyncController'

beforeEach(() => {
  useConfigSyncStore.getState().reset()
})

describe('ConfigSyncBanner', () => {
  it('renders nothing when syncError is null', () => {
    const { container } = render(<ConfigSyncBanner onRetry={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('configUnreachable → renders the unreachable banner; Retry fires onRetry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    useConfigSyncStore.getState().set({ syncError: 'configUnreachable' })
    render(<ConfigSyncBanner onRetry={onRetry} />)
    expect(screen.getByText(/config server unreachable/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('configRequestFailed → renders the request-failed banner', () => {
    useConfigSyncStore.getState().set({ syncError: 'configRequestFailed' })
    render(<ConfigSyncBanner onRetry={() => {}} />)
    expect(screen.getByText(/config request failed/i)).toBeInTheDocument()
  })

  it('wrongPassphraseOrCorrupt → decrypt-failed banner with the "Re-enter" action (design Section E)', () => {
    useConfigSyncStore.getState().set({ syncError: 'wrongPassphraseOrCorrupt' })
    render(<ConfigSyncBanner onRetry={() => {}} />)
    expect(screen.getByText(/couldn't decrypt your config/i)).toBeInTheDocument()
    // The design gives this state "Re-enter", not the transport errors' "Retry".
    expect(screen.getByRole('button', { name: /re-enter/i })).toBeInTheDocument()
  })

  it('insecureContext → HTTPS-needed banner with the "How" action', () => {
    useConfigSyncStore.getState().set({ syncError: 'insecureContext' })
    render(<ConfigSyncBanner onRetry={() => {}} />)
    expect(screen.getByText(/encrypted sync needs https/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /how/i })).toBeInTheDocument()
  })

  // WI-4 — at narrow widths the action button stacks full-width below the text (≥44px target).
  it('stacks the action full-width at narrow width (flex-col below 600)', () => {
    useConfigSyncStore.getState().set({ syncError: 'configUnreachable' })
    render(<ConfigSyncBanner onRetry={() => {}} />)
    const action = screen.getByRole('button', { name: /retry/i })
    expect(action.className).toContain('max-[599px]:w-full')
    const row = action.closest('div.flex')!
    expect(row.className).toContain('max-[599px]:flex-col')
  })
})

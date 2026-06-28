// WI-3 — first-run sync-consent prompt: accept / decline / Esc=decline / focus-on-decline /
// connecting handoff / settle-dismiss / RTL bidi-safety / phone bottom-sheet.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import i18n from '@/i18n'
import { AutoSyncConsentPrompt } from './AutoSyncConsentPrompt'
import { useSyncStore } from '@/stores/syncStore'
import type { SyncController } from '@/lib/sync/syncController'
import type { ViewportTier } from '@/hooks/useViewportTier'

const tierMock = vi.hoisted(() => ({ value: 'desktop' as ViewportTier }))
vi.mock('@/hooks/useViewportTier', () => ({ useViewportTier: () => tierMock.value }))

const makeController = (over: Partial<SyncController> = {}): SyncController => ({
  connect: vi.fn(),
  connectSingleOrigin: vi.fn(),
  resume: vi.fn(),
  syncNow: vi.fn(),
  disconnect: vi.fn(() => Promise.resolve(true)),
  maybeAutoConnect: vi.fn(() => Promise.resolve()),
  acceptAutoSync: vi.fn(),
  declineAutoSync: vi.fn(),
  ...over,
})

beforeEach(() => {
  useSyncStore.setState({ showAutoPrompt: false, status: 'local-only', config: null, autoSyncPrompt: 'unseen' })
})
afterEach(() => {
  tierMock.value = 'desktop'
  vi.restoreAllMocks()
})

describe('AutoSyncConsentPrompt', () => {
  it('renders the consent (title + both buttons) when showAutoPrompt is true', () => {
    useSyncStore.setState({ showAutoPrompt: true })
    render(<AutoSyncConsentPrompt controller={makeController()} />)
    expect(screen.getByText(/found your server/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sync to my server/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep local-only/i })).toBeInTheDocument()
  })

  it('renders nothing while showAutoPrompt is false (gated on the flag)', () => {
    render(<AutoSyncConsentPrompt controller={makeController()} />)
    expect(screen.queryByText(/found your server/i)).toBeNull()
  })

  it('accept → calls controller.acceptAutoSync', async () => {
    useSyncStore.setState({ showAutoPrompt: true })
    const acceptAutoSync = vi.fn()
    const user = userEvent.setup()
    render(<AutoSyncConsentPrompt controller={makeController({ acceptAutoSync })} />)
    await user.click(screen.getByRole('button', { name: /sync to my server/i }))
    expect(acceptAutoSync).toHaveBeenCalledOnce()
  })

  it('decline → calls controller.declineAutoSync', async () => {
    useSyncStore.setState({ showAutoPrompt: true })
    const declineAutoSync = vi.fn()
    const user = userEvent.setup()
    render(<AutoSyncConsentPrompt controller={makeController({ declineAutoSync })} />)
    await user.click(screen.getByRole('button', { name: /keep local-only/i }))
    expect(declineAutoSync).toHaveBeenCalledOnce()
  })

  it('Esc declines (the safe default — no quiet dismiss that leaves the question open)', async () => {
    useSyncStore.setState({ showAutoPrompt: true })
    const declineAutoSync = vi.fn()
    const user = userEvent.setup()
    render(<AutoSyncConsentPrompt controller={makeController({ declineAutoSync })} />)
    await user.keyboard('{Escape}')
    expect(declineAutoSync).toHaveBeenCalledOnce()
  })

  it('opens focus on "Keep local-only", not the primary', async () => {
    useSyncStore.setState({ showAutoPrompt: true })
    render(<AutoSyncConsentPrompt controller={makeController()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /keep local-only/i })).toHaveFocus(),
    )
  })

  it('shows the connecting state after accept while the status is syncing', async () => {
    useSyncStore.setState({ showAutoPrompt: true, status: 'syncing' })
    const user = userEvent.setup()
    render(<AutoSyncConsentPrompt controller={makeController()} />)
    await user.click(screen.getByRole('button', { name: /sync to my server/i }))
    expect(screen.getByText(/connecting to your server/i)).toBeInTheDocument()
    expect(screen.getByText(/uploading your local sessions/i)).toBeInTheDocument()
  })

  it('dismisses the connecting state once the status settles to idle (hands off to #9)', async () => {
    useSyncStore.setState({ showAutoPrompt: true, status: 'syncing' })
    const user = userEvent.setup()
    render(<AutoSyncConsentPrompt controller={makeController()} />)
    await user.click(screen.getByRole('button', { name: /sync to my server/i }))
    expect(screen.getByText(/connecting to your server/i)).toBeInTheDocument()
    act(() => useSyncStore.setState({ status: 'idle', showAutoPrompt: false }))
    await waitFor(() => expect(screen.queryByText(/connecting to your server/i)).toBeNull())
  })

  it('mirrors under RTL but keeps the server address LTR (bidi safety)', () => {
    vi.spyOn(i18n, 'dir').mockReturnValue('rtl')
    useSyncStore.setState({ showAutoPrompt: true })
    render(<AutoSyncConsentPrompt controller={makeController()} />)
    expect(screen.getByRole('dialog').getAttribute('dir')).toBe('rtl')
    expect(screen.getByText(window.location.host).getAttribute('dir')).toBe('ltr')
  })

  it('renders the consent as a bottom-sheet on phone (< 600)', () => {
    tierMock.value = 'phone'
    useSyncStore.setState({ showAutoPrompt: true })
    render(<AutoSyncConsentPrompt controller={makeController()} />)
    expect(screen.getByText(/found your server/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sync to my server/i })).toBeInTheDocument()
  })
})

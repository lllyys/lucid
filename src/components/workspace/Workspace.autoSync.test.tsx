// WI-3 — the #21 load-path wiring: the Workspace fires the auto-sync probe on mount (with an AbortSignal
// aborted on unmount) and renders the consent prompt, gated on the syncStore showAutoPrompt flag.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import '@/i18n'
import type { SyncController } from '@/lib/sync/syncController'
import { useSyncStore } from '@/stores/syncStore'

const ctrlMock = vi.hoisted(() => {
  const make = (): SyncController => ({
    connect: vi.fn(),
    connectSingleOrigin: vi.fn(),
    resume: vi.fn(),
    syncNow: vi.fn(),
    disconnect: vi.fn(() => Promise.resolve(true)),
    maybeAutoConnect: vi.fn(() => Promise.resolve()),
    acceptAutoSync: vi.fn(),
    declineAutoSync: vi.fn(),
  })
  return { controller: make(), make }
})
vi.mock('@/lib/sync/syncController', () => ({ createSyncController: () => ctrlMock.controller }))

import { Workspace } from './Workspace'

beforeEach(() => {
  ctrlMock.controller = ctrlMock.make()
  useSyncStore.setState({ showAutoPrompt: false, status: 'local-only', config: null, autoSyncPrompt: 'unseen' })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('Workspace — #21 auto-sync load wiring', () => {
  it('fires the eligibility probe on mount with an AbortSignal', () => {
    render(<Workspace />)
    expect(ctrlMock.controller.maybeAutoConnect).toHaveBeenCalledOnce()
    const signal = (ctrlMock.controller.maybeAutoConnect as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('aborts the in-flight probe signal on unmount', () => {
    const { unmount } = render(<Workspace />)
    const signal = (ctrlMock.controller.maybeAutoConnect as ReturnType<typeof vi.fn>).mock.calls[0][0]
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('does not render the consent prompt while showAutoPrompt is false', () => {
    render(<Workspace />)
    expect(screen.queryByText(/found your server/i)).toBeNull()
  })

  it('renders the consent prompt when showAutoPrompt flips true', () => {
    render(<Workspace />)
    act(() => useSyncStore.setState({ showAutoPrompt: true }))
    expect(screen.getByText(/found your server/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sync to my server/i })).toBeInTheDocument()
  })
})

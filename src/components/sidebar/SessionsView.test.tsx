import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/workspace/loadSource', () => ({ loadSourceIntoWorkspace: vi.fn() }))
vi.mock('@/hooks/useViewportTier', () => ({ useViewportTier: vi.fn(() => 'desktop') }))
import '@/i18n'
import { SessionsView } from './SessionsView'
import { loadSourceIntoWorkspace } from '@/lib/workspace/loadSource'
import { useViewportTier } from '@/hooks/useViewportTier'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'

const mockLoad = vi.mocked(loadSourceIntoWorkspace)
const mockTier = vi.mocked(useViewportTier)

beforeEach(() => {
  __resetSessionIds()
  useSessionStore.getState().reset()
  mockLoad.mockReset()
  mockTier.mockReset()
  mockTier.mockReturnValue('desktop')
})

/** Seed one session holding one translate task, then open the session detail (list of tasks). */
async function openSessionWithTask(user: ReturnType<typeof userEvent.setup>) {
  useSessionStore.getState().newSession()
  useSessionStore.getState().addTask({
    kind: 'translate',
    title: 'Greeting',
    sourceText: 'Hello world',
    resultText: 'Hola mundo',
    sourceLang: 'en',
    targetLang: 'zh',
    durationMs: 1500,
  })
  render(<SessionsView />)
  await user.click(screen.getByRole('button', { name: /Untitled session/i }))
}

describe('SessionsView task read view (feature #25, WI-4)', () => {
  it('clicking the row body opens the read-only task detail (the task list is hidden)', async () => {
    const user = userEvent.setup()
    await openSessionWithTask(user)
    await user.click(screen.getByRole('button', { name: /Greeting/i }))
    // The read view shows its Open-in-workspace action + the full result text.
    expect(screen.getByRole('button', { name: /open in workspace/i })).toBeInTheDocument()
    expect(screen.getByText('Hola mundo')).toBeInTheDocument()
  })

  it('the ↗ button loads the source into the workspace WITHOUT opening the read view (stopPropagation)', async () => {
    const user = userEvent.setup()
    await openSessionWithTask(user)
    await user.click(screen.getByRole('button', { name: /load into workspace/i }))
    expect(mockLoad).toHaveBeenCalledWith('Hello world')
    // Still in the task list — the read view's Open-in-workspace action did NOT appear.
    expect(screen.queryByRole('button', { name: /open in workspace/i })).toBeNull()
  })

  it('the read view back link returns to the task list', async () => {
    const user = userEvent.setup()
    await openSessionWithTask(user)
    await user.click(screen.getByRole('button', { name: /Greeting/i }))
    await user.click(screen.getByRole('button', { name: /untitled session/i })) // ‹ {sessionName}
    // Back in the list: the ↗ load affordance is present again; the read action is gone.
    expect(screen.getByRole('button', { name: /load into workspace/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open in workspace/i })).toBeNull()
  })

  it('renders the ↗ load affordance for every task row (always present below 600px)', async () => {
    mockTier.mockReturnValue('phone')
    const user = userEvent.setup()
    await openSessionWithTask(user)
    expect(screen.getByRole('button', { name: /load into workspace/i })).toBeInTheDocument()
  })
})

describe('SessionsView (WI-5)', () => {
  it('shows the empty state when there are no sessions', () => {
    render(<SessionsView />)
    expect(screen.getByText(/sessions and their tasks will appear/i)).toBeInTheDocument()
  })

  it('New session creates a session and opens its detail', async () => {
    const user = userEvent.setup()
    render(<SessionsView />)
    await user.click(screen.getByRole('button', { name: /new session/i }))
    expect(useSessionStore.getState().sessions).toHaveLength(1)
    // detail view: shows the (untitled) name + the back control
    expect(screen.getByText('Untitled session')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all sessions/i })).toBeInTheDocument()
  })

  it('lists existing sessions and opens one on click', async () => {
    useSessionStore.getState().newSession()
    useSessionStore.getState().renameSession(useSessionStore.getState().sessions[0].id, 'Physics paper')
    const user = userEvent.setup()
    render(<SessionsView />)
    await user.click(screen.getByRole('button', { name: /Physics paper/i }))
    expect(screen.getByRole('button', { name: /all sessions/i })).toBeInTheDocument()
    expect(screen.getByText('0 tasks')).toBeInTheDocument()
  })

  it('renames a session via the rename control', async () => {
    const user = userEvent.setup()
    render(<SessionsView />)
    await user.click(screen.getByRole('button', { name: /new session/i })) // creates + opens detail
    const id = useSessionStore.getState().sessions[0].id
    await user.click(screen.getByRole('button', { name: /rename session/i })) // ✎
    const input = screen.getByLabelText(/rename session/i)
    await user.clear(input)
    await user.type(input, 'Renamed{Enter}')
    expect(useSessionStore.getState().sessions.find((s) => s.id === id)!.name).toBe('Renamed')
  })

  it('search filters the session list', async () => {
    const a = useSessionStore.getState().newSession()
    const b = useSessionStore.getState().newSession()
    useSessionStore.getState().renameSession(a, 'Alpha')
    useSessionStore.getState().renameSession(b, 'Beta')
    useSessionStore.getState().selectSession(a) // keep list view (no detail open initially)
    const user = userEvent.setup()
    render(<SessionsView />)
    await user.type(screen.getByLabelText(/search sessions/i), 'alph')
    expect(screen.getByRole('button', { name: /Alpha/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Beta/i })).toBeNull()
  })

  it('shows recorded tasks in a session detail', async () => {
    useSessionStore.getState().newSession()
    useSessionStore.getState().addTask({ kind: 'polish', title: 'Polished intro', sourceText: 'intro', resultText: 'better intro' })
    const user = userEvent.setup()
    render(<SessionsView />)
    await user.click(screen.getByRole('button', { name: /Untitled session/i }))
    expect(screen.getByText('Polished intro')).toBeInTheDocument()
    expect(screen.getByText('1 tasks')).toBeInTheDocument()
  })

  it('back returns from detail to the list', async () => {
    useSessionStore.getState().newSession()
    const user = userEvent.setup()
    render(<SessionsView />)
    await user.click(screen.getByRole('button', { name: /Untitled session/i }))
    await user.click(screen.getByRole('button', { name: /all sessions/i }))
    expect(screen.getByRole('button', { name: /new session/i })).toBeInTheDocument()
  })
})

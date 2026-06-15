import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SessionsView } from './SessionsView'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'

beforeEach(() => {
  __resetSessionIds()
  useSessionStore.getState().reset()
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

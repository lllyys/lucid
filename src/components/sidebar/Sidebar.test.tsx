import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { Sidebar } from './Sidebar'
import { useSessionStore } from '@/stores/sessionStore'
import { useGlossaryStore } from '@/stores/glossaryStore'

beforeEach(() => {
  useSessionStore.getState().reset()
  useGlossaryStore.getState().reset()
})

describe('Sidebar (WI-4 shell)', () => {
  it('renders both tabs with Sessions active by default', () => {
    render(<Sidebar />)
    expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Glossary' })).toHaveAttribute('aria-selected', 'false')
  })

  it('shows the sessions empty state by default', () => {
    render(<Sidebar />)
    expect(screen.getByText(/sessions and their tasks will appear/i)).toBeInTheDocument()
  })

  it('switches to the Glossary tab and shows its empty state', async () => {
    const user = userEvent.setup()
    render(<Sidebar />)
    await user.click(screen.getByRole('tab', { name: 'Glossary' }))
    expect(screen.getByRole('tab', { name: 'Glossary' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/saved domain terms live here/i)).toBeInTheDocument()
    expect(screen.queryByText(/sessions and their tasks/i)).toBeNull()
  })
})

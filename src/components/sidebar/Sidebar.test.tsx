import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { Sidebar } from './Sidebar'
import { useSessionStore } from '@/stores/sessionStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { useStarredStore } from '@/stores/starredStore'

beforeEach(() => {
  useSessionStore.getState().reset()
  useGlossaryStore.getState().reset()
  useStarredStore.getState().reset()
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

  // WI-4 (feature #22) — the third "Starred" tab joins Sessions/Glossary.
  it('renders a third Starred tab and shows its empty state when selected', async () => {
    const user = userEvent.setup()
    render(<Sidebar />)
    const starredTab = screen.getByRole('tab', { name: 'Starred' })
    expect(starredTab).toHaveAttribute('aria-selected', 'false')
    await user.click(starredTab)
    expect(screen.getByRole('tab', { name: 'Starred' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/nothing starred yet/i)).toBeInTheDocument()
    // the other two tabs still exist and their panels are gone
    expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByText(/sessions and their tasks/i)).toBeNull()
  })

  it('lists starred items under the Starred tab', async () => {
    useStarredStore.getState().star({
      kind: 'word', source: 'latency', translation: '延迟', sourceLang: 'en', targetLang: 'zh',
    })
    const user = userEvent.setup()
    render(<Sidebar />)
    await user.click(screen.getByRole('tab', { name: 'Starred' }))
    expect(screen.getByText('latency')).toBeInTheDocument()
    expect(screen.getByText('1 starred')).toBeInTheDocument()
  })

  // WI-2 — the drawer variant fills the off-canvas panel (w-full); inline keeps the fixed width.
  it('uses the fixed inline width by default', () => {
    const { container } = render(<Sidebar />)
    const aside = container.querySelector('aside')!
    expect(aside.className).toContain('w-[268px]')
    expect(aside.className).toContain('shrink-0')
  })

  it('fills its container in the drawer variant', () => {
    const { container } = render(<Sidebar variant="drawer" />)
    const aside = container.querySelector('aside')!
    expect(aside.className).toContain('w-full')
    expect(aside.className).not.toContain('w-[268px]')
    // The drawer panel owns its own border/background, so the sidebar drops its own right border.
    expect(aside.className).not.toContain('border-r')
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { Workspace } from './Workspace'
import type { ViewportTier } from '@/hooks/useViewportTier'

// Drive the responsive tier by mocking the hook (the plan's M5 — mock the hook, not matchMedia, for
// component/integration tests). Default = desktop so the existing no-regression assertions hold.
const tierMock = vi.hoisted(() => ({ value: 'desktop' as ViewportTier }))
vi.mock('@/hooks/useViewportTier', () => ({ useViewportTier: () => tierMock.value }))

afterEach(() => {
  tierMock.value = 'desktop'
})

// WI-3 — the static layout shell. Behavioral: the designed chrome (header brand +
// tagline + run hint + Settings, toolbar subtitle) renders, plus the feature-#3 sidebar.
describe('Workspace shell (desktop)', () => {
  it('renders the header brand, tagline, run hint, and Settings affordance', () => {
    render(<Workspace />)
    expect(screen.getByText('Lucid')).toBeInTheDocument()
    expect(screen.getByText(/translate & polish/i)).toBeInTheDocument()
    expect(screen.getByText(/to run/i)).toBeInTheDocument()
    // Exact name — "Open Settings" (the auto-run disabled-reason link) also matches /settings/i.
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders the toolbar subtitle', () => {
    render(<Workspace />)
    expect(screen.getByText(/one workspace/i)).toBeInTheDocument()
  })

  it('renders the inline Sessions & Glossary sidebar (feature #3) and no hamburger', () => {
    const { container } = render(<Workspace />)
    expect(container.querySelector('aside')).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Sessions' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Glossary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open menu/i })).toBeNull()
  })
})

// WI-2 — responsive reflow. Below 960 the inline sidebar moves into the off-canvas drawer; the ☰
// hamburger opens it.
describe('Workspace reflow (feature #16)', () => {
  it('moves the sidebar into a drawer at tablet width (no inline aside, hamburger present)', () => {
    tierMock.value = 'tablet'
    const { container } = render(<Workspace />)
    // No inline sidebar in the document flow; the tabs are not visible until the drawer opens.
    expect(container.querySelector('aside')).toBeNull()
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Sessions' })).toBeNull()
  })

  it('opens the drawer from the hamburger at tablet width', async () => {
    tierMock.value = 'tablet'
    const user = userEvent.setup()
    render(<Workspace />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    expect(await screen.findByRole('tab', { name: 'Sessions' })).toBeInTheDocument()
  })

  it('drops the tagline + run hint in the compact header below 960', () => {
    tierMock.value = 'tablet'
    render(<Workspace />)
    expect(screen.queryByText(/translate & polish/i)).toBeNull()
    expect(screen.queryByText(/to run/i)).toBeNull()
    expect(screen.getByText('Lucid')).toBeInTheDocument()
  })
})

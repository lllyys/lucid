import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { Workspace } from './Workspace'
import type { ViewportTier } from '@/hooks/useViewportTier'
import { useOperationStore } from '@/stores/operationStore'

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

// WI-3 — phone single-pane via the PaneSwitcher + visibility toggle (both panels MOUNTED). The C1
// regression guard: switching Translate↔Polish must never wipe component-local state.
describe('Workspace single-pane (phone, feature #16)', () => {
  beforeEach(() => {
    useOperationStore.getState().reset('polish')
    tierMock.value = 'phone'
  })

  it('shows the PaneSwitcher (not the toolbar subtitle) and starts on Translate', () => {
    render(<Workspace />)
    expect(screen.getByRole('radiogroup', { name: 'Active pane' })).toBeInTheDocument()
    expect(screen.queryByText(/one workspace/i)).toBeNull()
    expect(screen.getByRole('radio', { name: 'Translate' })).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps both panels mounted and toggles which is visible', async () => {
    const user = userEvent.setup()
    const { container } = render(<Workspace />)
    // Both editors exist in the DOM at all times (mounted); only visibility flips.
    const sourceEditor = screen.getByLabelText('Source')
    const draftEditor = screen.getByLabelText('Draft to polish')
    expect(sourceEditor).toBeInTheDocument()
    expect(draftEditor).toBeInTheDocument()

    // helper: is this node inside a `hidden` wrapper?
    const isHidden = (el: HTMLElement) => el.closest('.hidden') !== null
    expect(isHidden(sourceEditor)).toBe(false)
    expect(isHidden(draftEditor)).toBe(true)

    await user.click(screen.getByRole('radio', { name: 'Polish' }))
    expect(isHidden(screen.getByLabelText('Source'))).toBe(true)
    expect(isHidden(screen.getByLabelText('Draft to polish'))).toBe(false)
    expect(container).toBeTruthy()
  })

  it('preserves the typed source AND a partially-rejected polish diff across a Translate↔Polish round-trip', async () => {
    const user = userEvent.setup()
    render(<Workspace />)

    // 1) Type source text in the Translate pane.
    const source = screen.getByLabelText('Source')
    await user.type(source, 'hello world')
    expect((source as HTMLTextAreaElement).value).toBe('hello world')

    // 2) Switch to Polish, populate the draft, drive a done polish op, reject the hunk.
    await user.click(screen.getByRole('radio', { name: 'Polish' }))
    const draft = screen.getByLabelText('Draft to polish')
    await user.type(draft, 'the cat sat')
    // A done polish result that differs from the draft (cat → dog) → exactly one change hunk.
    useOperationStore.setState({
      polish: { status: 'done', text: 'the dog sat', startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false },
    })
    await user.click(await screen.findByRole('button', { name: /compare/i }))
    await user.click(screen.getByRole('button', { name: /reject this change/i }))
    expect(screen.getByText('0 of 1 kept')).toBeInTheDocument()

    // 3) Round-trip: Polish → Translate → Polish.
    await user.click(screen.getByRole('radio', { name: 'Translate' }))
    expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toBe('hello world')
    await user.click(screen.getByRole('radio', { name: 'Polish' }))

    // The draft text AND the partially-rejected diff survive — the panel never unmounted.
    expect((screen.getByLabelText('Draft to polish') as HTMLTextAreaElement).value).toBe('the cat sat')
    expect(screen.getByText('0 of 1 kept')).toBeInTheDocument()
    expect(
      within(screen.getByRole('radiogroup', { name: 'Active pane' })).getByRole('radio', { name: 'Polish' }),
    ).toHaveAttribute('aria-checked', 'true')
  })
})

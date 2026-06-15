import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/i18n'
import { Workspace } from './Workspace'

// WI-3 — the static layout shell. Behavioral: the designed chrome (header brand +
// tagline + run hint + Settings, toolbar subtitle) renders, plus the feature-#3 sidebar.
describe('Workspace shell', () => {
  it('renders the header brand, tagline, run hint, and Settings affordance', () => {
    render(<Workspace />)
    expect(screen.getByText('Lucid')).toBeInTheDocument()
    expect(screen.getByText(/translate & polish/i)).toBeInTheDocument()
    expect(screen.getByText(/to run/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })

  it('renders the toolbar subtitle', () => {
    render(<Workspace />)
    expect(screen.getByText(/one workspace/i)).toBeInTheDocument()
  })

  it('renders the Sessions & Glossary sidebar (feature #3)', () => {
    const { container } = render(<Workspace />)
    expect(container.querySelector('aside')).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Sessions' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Glossary' })).toBeInTheDocument()
  })
})

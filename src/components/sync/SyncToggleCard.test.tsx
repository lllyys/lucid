// WI-3 (#19) — the simplified Settings · Sync OFF state: an on/off switch (calls onTurnOn) replacing the
// URL+token form, a static scope grid, and a collapsed Advanced disclosure that reveals the ConnectForm
// whose submit calls onConnect (the remote/cross-origin path).
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { SyncToggleCard } from './SyncToggleCard'

const baseProps = {
  origin: 'lucid.example.com',
  onTurnOn: vi.fn(),
  onConnect: vi.fn(),
}

const setup = (overrides: Partial<typeof baseProps> = {}) => {
  const props = { ...baseProps, onTurnOn: vi.fn(), onConnect: vi.fn(), ...overrides }
  render(<SyncToggleCard {...props} />)
  return props
}

describe('SyncToggleCard', () => {
  it('renders the on/off switch (off) — not the URL+token form', () => {
    setup()
    const sw = screen.getByRole('switch', { name: /sync workspace data to this server/i })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    // the advanced ConnectForm is collapsed — no server-url field visible
    expect(screen.queryByLabelText(/server url/i)).toBeNull()
  })

  it('shows the served origin in the switch sub-line', () => {
    setup({ origin: 'my.host.dev' })
    expect(screen.getByText(/my\.host\.dev · same origin · no token needed/i)).toBeInTheDocument()
  })

  it('toggling the switch on calls onTurnOn (single-origin connect)', async () => {
    const onTurnOn = vi.fn()
    const user = userEvent.setup()
    setup({ onTurnOn })
    await user.click(screen.getByRole('switch', { name: /sync workspace data to this server/i }))
    expect(onTurnOn).toHaveBeenCalledOnce()
  })

  it('renders the static 2×2 scope grid (keys never leave)', () => {
    setup()
    expect(screen.getByText(/sessions & task history/i)).toBeInTheDocument()
    expect(screen.getByText(/glossary terms/i)).toBeInTheDocument()
    expect(screen.getByText(/polish keywords/i)).toBeInTheDocument()
    expect(screen.getByText(/provider api keys — never/i)).toBeInTheDocument()
  })

  it('the Advanced disclosure is collapsed by default (aria-expanded=false)', () => {
    setup()
    const disclosure = screen.getByRole('button', { name: /use a different server/i })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  })

  it('expanding Advanced reveals the ConnectForm; submitting it calls onConnect (remote path)', async () => {
    const onConnect = vi.fn()
    const user = userEvent.setup()
    setup({ onConnect })
    await user.click(screen.getByRole('button', { name: /use a different server/i }))
    expect(screen.getByRole('button', { name: /use a different server/i })).toHaveAttribute('aria-expanded', 'true')
    await user.type(screen.getByLabelText(/server url/i), 'https://remote.dev')
    await user.type(screen.getByLabelText(/access token/i), 'tok_remote99')
    await user.click(screen.getByRole('button', { name: /connect server/i }))
    expect(onConnect).toHaveBeenCalledWith({ serverUrl: 'https://remote.dev', token: 'tok_remote99' })
  })

  it('"Use this server instead" collapses Advanced back to the toggle', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /use a different server/i }))
    await user.click(screen.getByRole('button', { name: /use this server instead/i }))
    expect(screen.getByRole('button', { name: /use a different server/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText(/server url/i)).toBeNull()
  })

  it('the disclosure controls the panel it expands (aria-controls)', async () => {
    const user = userEvent.setup()
    setup()
    const disclosure = screen.getByRole('button', { name: /use a different server/i })
    const controls = disclosure.getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    await user.click(disclosure)
    expect(document.getElementById(controls as string)).toBeInTheDocument()
  })
})

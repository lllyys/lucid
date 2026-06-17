// WI-9c — Settings · Sync connect form (design surface B): connect inputs, token reveal, opt-in copy,
// data-scope list, and the connecting state.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { ConnectForm } from './ConnectForm'

describe('ConnectForm', () => {
  it('renders the header, opt-in callout and the data-scope list', () => {
    render(<ConnectForm onConnect={vi.fn()} />)
    expect(screen.getByText(/connect a sync server/i)).toBeInTheDocument()
    expect(screen.getByText(/off by default/i)).toBeInTheDocument()
    expect(screen.getByText(/sessions & task history/i)).toBeInTheDocument()
    expect(screen.getByText(/glossary terms/i)).toBeInTheDocument()
    expect(screen.getByText(/polish keywords/i)).toBeInTheDocument()
    expect(screen.getByText(/provider api keys — never/i)).toBeInTheDocument()
  })

  it('Connect is disabled until both URL and token are non-empty', async () => {
    const user = userEvent.setup()
    render(<ConnectForm onConnect={vi.fn()} />)
    const connect = screen.getByRole('button', { name: /connect server/i })
    expect(connect).toBeDisabled()
    await user.type(screen.getByLabelText(/server url/i), 'https://lucid.myserver.dev')
    expect(connect).toBeDisabled()
    await user.type(screen.getByLabelText(/access token/i), 'tok_abcd1234')
    expect(connect).toBeEnabled()
  })

  it('submitting calls onConnect with the trimmed serverUrl + token', async () => {
    const onConnect = vi.fn()
    const user = userEvent.setup()
    render(<ConnectForm onConnect={onConnect} />)
    await user.type(screen.getByLabelText(/server url/i), '  https://lucid.myserver.dev  ')
    await user.type(screen.getByLabelText(/access token/i), 'tok_abcd1234')
    await user.click(screen.getByRole('button', { name: /connect server/i }))
    expect(onConnect).toHaveBeenCalledWith({ serverUrl: 'https://lucid.myserver.dev', token: 'tok_abcd1234' })
  })

  it('the token field is masked by default and Show/Hide toggles it', async () => {
    const user = userEvent.setup()
    render(<ConnectForm onConnect={vi.fn()} />)
    const token = screen.getByLabelText(/access token/i)
    expect(token).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show/i }))
    expect(token).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: /hide/i }))
    expect(token).toHaveAttribute('type', 'password')
  })

  it('Stay local-only fires onStayLocal', async () => {
    const onStayLocal = vi.fn()
    const user = userEvent.setup()
    render(<ConnectForm onConnect={vi.fn()} onStayLocal={onStayLocal} />)
    await user.click(screen.getByRole('button', { name: /stay local-only/i }))
    expect(onStayLocal).toHaveBeenCalledOnce()
  })

  it('prefills from initialConfig (re-connect / update-token flow)', () => {
    render(<ConnectForm onConnect={vi.fn()} initialConfig={{ serverUrl: 'https://kept.example', token: 'old_token_99' }} />)
    expect(screen.getByLabelText(/server url/i)).toHaveValue('https://kept.example')
    expect(screen.getByLabelText(/access token/i)).toHaveValue('old_token_99')
  })

  it('connecting state shows the spinner checklist + a Cancel button', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<ConnectForm onConnect={vi.fn()} connecting serverUrl="lucid.myserver.dev" onCancel={onCancel} />)
    expect(screen.getByText(/connecting…/i)).toBeInTheDocument()
    expect(screen.getByText(/reached server/i)).toBeInTheDocument()
    expect(screen.getByText(/pulling changes…/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

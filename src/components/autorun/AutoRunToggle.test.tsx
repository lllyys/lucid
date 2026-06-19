import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { AutoRunToggle } from './AutoRunToggle'
import { useProviderStore } from '@/stores/providerStore'
import { OPEN_SETTINGS_EVENT } from '@/lib/workspace/openSettings'

beforeEach(() => {
  useProviderStore.getState().reset()
})

describe('AutoRunToggle', () => {
  it('renders an off switch and toggles on click', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<AutoRunToggle enabled={false} canEnable onToggle={onToggle} />)
    const sw = screen.getByRole('switch')
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await user.click(sw)
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('reflects the on state and toggles back off', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<AutoRunToggle enabled canEnable onToggle={onToggle} />)
    const sw = screen.getByRole('switch')
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await user.click(sw)
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('is disabled with a reason + Open Settings when the provider is not ready', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<AutoRunToggle enabled={false} canEnable={false} onToggle={onToggle} />)
    expect(screen.getByRole('switch')).toBeDisabled()
    expect(screen.getByText(/add a key for/i)).toBeInTheDocument()

    const fired = vi.fn()
    window.addEventListener(OPEN_SETTINGS_EVENT, fired)
    await user.click(screen.getByRole('button', { name: /open settings/i }))
    expect(fired).toHaveBeenCalledTimes(1)
    window.removeEventListener(OPEN_SETTINGS_EVENT, fired)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { AutoRunPausedBanner } from './AutoRunPausedBanner'
import { OPEN_SETTINGS_EVENT } from '@/lib/workspace/openSettings'

describe('AutoRunPausedBanner', () => {
  it('shows the paused warning and routes Fix to Settings', async () => {
    const user = userEvent.setup()
    render(<AutoRunPausedBanner />)
    expect(screen.getByText(/auto-run paused/i)).toBeInTheDocument()
    const fired = vi.fn()
    window.addEventListener(OPEN_SETTINGS_EVENT, fired)
    await user.click(screen.getByRole('button', { name: /^fix$/i }))
    expect(fired).toHaveBeenCalledTimes(1)
    window.removeEventListener(OPEN_SETTINGS_EVENT, fired)
  })
})

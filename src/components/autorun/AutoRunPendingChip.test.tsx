import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { AutoRunPendingChip } from './AutoRunPendingChip'

describe('AutoRunPendingChip', () => {
  it('renders the standalone chip with the debounce duration and cancels', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<AutoRunPendingChip debounceMs={1500} pendingKey={1} onCancel={onCancel} />)
    expect(screen.getByText(/auto-run in 1\.5s/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /cancel pending auto-run/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders the compact footer variant without a cancel button', () => {
    render(<AutoRunPendingChip debounceMs={1500} pendingKey={2} onCancel={vi.fn()} variant="footer" />)
    expect(screen.getByText(/auto-run in 1\.5s/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

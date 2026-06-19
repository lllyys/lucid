import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { AutoRunCostDialog } from './AutoRunCostDialog'
import { useProviderStore } from '@/stores/providerStore'

beforeEach(() => {
  useProviderStore.getState().reset()
})

describe('AutoRunCostDialog', () => {
  it('shows the cost gate with the active provider label and confirms', async () => {
    useProviderStore.getState().setVendor('openai')
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<AutoRunCostDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByText(/auto-run uses a paid provider/i)).toBeInTheDocument()
    expect(screen.getByText(/OpenAI/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable auto-run/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('dismisses via Not now without confirming', async () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<AutoRunCostDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: /not now/i }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders nothing when closed', () => {
    render(<AutoRunCostDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByText(/auto-run uses a paid provider/i)).toBeNull()
  })
})

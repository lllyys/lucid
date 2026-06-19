// WI-3 — the remove-custom confirm dialog (#10, design Section D).
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { RemoveCustomDialog } from './RemoveCustomDialog'

describe('RemoveCustomDialog', () => {
  it('shows the provider label in the title and confirms via onConfirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <RemoveCustomDialog open label="Office gateway" isActive={false} onConfirm={onConfirm} onOpenChange={() => {}} />,
    )
    expect(screen.getByText(/remove "office gateway"\?/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove provider/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('shows the active-fallback notice only when removing the active custom', () => {
    const { rerender } = render(
      <RemoveCustomDialog open label="Office gateway" isActive={false} onConfirm={() => {}} onOpenChange={() => {}} />,
    )
    expect(screen.queryByText(/active provider/i)).toBeNull()
    rerender(
      <RemoveCustomDialog open label="Office gateway" isActive fallbackLabel="Anthropic" onConfirm={() => {}} onOpenChange={() => {}} />,
    )
    expect(screen.getByText(/active provider/i)).toBeInTheDocument()
    expect(screen.getByText(/anthropic/i)).toBeInTheDocument()
  })

  it('Cancel closes without confirming (onOpenChange(false), no onConfirm)', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <RemoveCustomDialog open label="X" isActive={false} onConfirm={onConfirm} onOpenChange={onOpenChange} />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

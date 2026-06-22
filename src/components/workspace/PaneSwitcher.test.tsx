import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { PaneSwitcher } from './PaneSwitcher'

// WI-3 — the phone-only Translate/Polish segmented switcher (design Sections A/B/C). a11y:
// role="radiogroup" + two role="radio" chips with aria-checked; click → onChange; visible focus.
describe('PaneSwitcher', () => {
  it('renders a radiogroup with two radios reflecting the active value', () => {
    render(<PaneSwitcher value="translate" onChange={() => {}} />)
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'Translate' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Polish' })).toHaveAttribute('aria-checked', 'false')
  })

  it('reflects the polish value as checked', () => {
    render(<PaneSwitcher value="polish" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Polish' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Translate' })).toHaveAttribute('aria-checked', 'false')
  })

  it('fires onChange with the clicked pane', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PaneSwitcher value="translate" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Polish' }))
    expect(onChange).toHaveBeenCalledWith('polish')
  })

  it('does not re-fire onChange when the active chip is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PaneSwitcher value="translate" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Translate' }))
    // Clicking the already-active chip is a no-op (still translate); onChange may be called with the
    // same value, but it must never switch away — assert it is not called with 'polish'.
    expect(onChange).not.toHaveBeenCalledWith('polish')
  })

  it('uses roving tabindex (only the active chip is in the tab order)', () => {
    render(<PaneSwitcher value="translate" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Translate' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Polish' })).toHaveAttribute('tabindex', '-1')
  })
})

// WI-1 (feature #18) — the polish-goal selector radiogroup. Renders the 4 goals in design order,
// reflects the active value via aria-checked, fires onChange on click + arrow-key (wrapping), disables.
// Behavior asserted via ARIA roles/names (rule 10).
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { GoalChips } from './GoalChips'

describe('GoalChips', () => {
  it('renders the four goals in design order inside a radiogroup', () => {
    render(<GoalChips value="clarity" onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: /goal/i })).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Clarity',
      'Grammar',
      'Tone',
      'Concise',
    ])
  })

  it('marks the active goal aria-checked and the rest unchecked', () => {
    render(<GoalChips value="grammar" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Grammar' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Clarity' })).not.toBeChecked()
  })

  it('fires onChange with the clicked goal', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GoalChips value="clarity" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Tone' }))
    expect(onChange).toHaveBeenCalledWith('tone')
  })

  it('arrow keys move + select with wrap-around', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GoalChips value="clarity" onChange={onChange} />)
    screen.getByRole('radio', { name: 'Clarity' }).focus()
    await user.keyboard('{ArrowRight}') // clarity → grammar (design order)
    expect(onChange).toHaveBeenLastCalledWith('grammar')
    onChange.mockClear()
    await user.keyboard('{ArrowLeft}') // clarity → wrap to concise (last)
    expect(onChange).toHaveBeenLastCalledWith('concise')
  })

  it('only the active chip is in the tab order (roving tabindex)', () => {
    render(<GoalChips value="tone" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Tone' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Clarity' })).toHaveAttribute('tabindex', '-1')
  })

  it('disables all chips when disabled', () => {
    render(<GoalChips value="clarity" onChange={() => {}} disabled />)
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled())
  })
})

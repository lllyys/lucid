import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/i18n'
import { AutoTag } from './AutoTag'

describe('AutoTag', () => {
  it('renders the AUTO chip when the op was auto-triggered', () => {
    render(<AutoTag isAuto />)
    expect(screen.getByRole('status', { name: /auto-run triggered/i })).toBeInTheDocument()
    expect(screen.getByText('auto')).toBeInTheDocument()
  })

  it('renders nothing for a manual run', () => {
    const { container } = render(<AutoTag isAuto={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})

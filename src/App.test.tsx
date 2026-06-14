import { render, screen } from '@testing-library/react'
import App from '@/App'

// WI-1 — app shell renders its identifying heading (behavioral smoke).
it('renders the app heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /lucid/i })).toBeInTheDocument()
})

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import '@/i18n'
import { FooterPrivacy } from './FooterPrivacy'
import { useProviderStore } from '@/stores/providerStore'

beforeEach(() => {
  useProviderStore.getState().reset()
})

describe('FooterPrivacy', () => {
  it('shows the hosted privacy line for a hosted provider', () => {
    render(<FooterPrivacy />)
    expect(screen.getByText(/sent to anthropic/i)).toBeInTheDocument()
  })

  it('shows the local privacy line when a local provider is active', () => {
    act(() => {
      useProviderStore.setState({ vendor: 'ollama' })
    })
    render(<FooterPrivacy />)
    expect(screen.getByText(/stays on this device/i)).toBeInTheDocument()
  })
})

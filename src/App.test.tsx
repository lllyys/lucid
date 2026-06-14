import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import App from '@/App'
import i18n from '@/i18n'
import { useProviderStore } from '@/stores/providerStore'

beforeEach(() => {
  useProviderStore.getState().reset()
})

describe('App (WI-7 shell wiring)', () => {
  it('renders the brand wordmark and the localized tagline (i18n wired)', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /lucid/i })).toBeInTheDocument()
    expect(screen.getByText(/translation & writing-polish/i)).toBeInTheDocument()
  })

  it('reflects provider readiness from the store', () => {
    render(<App />)
    expect(screen.getByText(/add a provider api key/i)).toBeInTheDocument()
    act(() => useProviderStore.getState().setApiKey('sk-test'))
    expect(screen.getByText(/anthropic is ready/i)).toBeInTheDocument()
  })

  it('round-trips an error.* key through t() (rule 66 §5)', () => {
    expect(i18n.t('error.rateLimited')).toContain('rate limit')
    expect(i18n.t('error.invalidKey')).not.toBe('error.invalidKey') // resolved, not the raw key
  })

  it('has a localized string for every ProviderError kind', () => {
    const kinds = [
      'rateLimited',
      'providerDown',
      'invalidKey',
      'requestFailed',
      'timeout',
      'aborted',
      'refusal',
      'incomplete',
      'validation',
      'unknown',
    ]
    for (const kind of kinds) {
      expect(i18n.t(`error.${kind}`), `missing i18n key error.${kind}`).not.toBe(`error.${kind}`)
    }
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import App from '@/App'
import i18n from '@/i18n'
import { useProviderStore } from '@/stores/providerStore'
import type { ErrorKind } from '@/providers/types'

// Exhaustive by construction: adding an ErrorKind to the union without an entry
// here is a compile error, forcing its i18n key to be covered below.
const ALL_ERROR_KINDS: Record<ErrorKind, true> = {
  rateLimited: true,
  providerDown: true,
  invalidKey: true,
  requestFailed: true,
  timeout: true,
  aborted: true,
  refusal: true,
  incomplete: true,
  validation: true,
  unknown: true,
}

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
    for (const kind of Object.keys(ALL_ERROR_KINDS) as ErrorKind[]) {
      expect(i18n.t(`error.${kind}`), `missing i18n key error.${kind}`).not.toBe(`error.${kind}`)
    }
  })
})

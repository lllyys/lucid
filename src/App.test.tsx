import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '@/App'
import i18n from '@/i18n'
import type { ErrorKind } from '@/providers/types'

// Exhaustive by construction: adding an ErrorKind to the union without an entry here is a
// compile error, forcing its i18n key to be covered below.
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

describe('App', () => {
  it('renders the Lucid Workspace shell', () => {
    render(<App />)
    expect(screen.getByText('Lucid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
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

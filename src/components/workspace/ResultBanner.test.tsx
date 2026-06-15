import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import i18n from '@/i18n'
import { ResultBanner } from './ResultBanner'
import { makeProviderError } from '@/providers/errors'
import type { ErrorKind } from '@/providers/types'

const ALL_KINDS: ErrorKind[] = [
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

describe('ResultBanner', () => {
  it('a retryable error with NO partial shows the message + Retry, and Retry fires', async () => {
    const onRetry = vi.fn()
    render(<ResultBanner status="error" error={makeProviderError('rateLimited')} hasPartial={false} onRetry={onRetry} />)
    expect(screen.getByText('Rate limited')).toBeInTheDocument()
    expect(screen.getByText(/please wait a moment/i)).toBeInTheDocument() // localized body
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('a retryable error WITH partial text offers no Retry (no replay — rule 65 §4)', () => {
    render(<ResultBanner status="error" error={makeProviderError('rateLimited')} hasPartial onRetry={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('a non-retryable error (invalidKey) offers no Retry', () => {
    render(<ResultBanner status="error" error={makeProviderError('invalidKey')} hasPartial={false} onRetry={vi.fn()} />)
    expect(screen.getByText('Invalid API key')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('a cancelled op shows the neutral Stopped copy and no Retry', () => {
    render(<ResultBanner status="cancelled" hasPartial onRetry={vi.fn()} />)
    expect(screen.getByText('Stopped')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('NEVER renders error.detail (rule 65 §5)', () => {
    const err = { ...makeProviderError('providerDown'), detail: 'SECRET-DETAIL-xyz' }
    render(<ResultBanner status="error" error={err} hasPartial={false} onRetry={vi.fn()} />)
    expect(screen.queryByText(/SECRET-DETAIL/)).toBeNull()
  })

  it('has a resolved title for every ErrorKind (exhaustive, v4 §6)', () => {
    for (const kind of ALL_KINDS) {
      expect(i18n.t(`banner.${kind}.title`), `missing banner.${kind}.title`).not.toBe(`banner.${kind}.title`)
    }
  })
})

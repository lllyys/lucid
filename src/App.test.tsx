import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '@/App'
import i18n from '@/i18n'
import type { ErrorKind } from '@/providers/types'
import { useConfigSyncStore } from '@/lib/config/configSyncController'

// The config-sync gate (#15 WI-6) wraps the workspace and probes the server on mount. In these shell
// tests we don't exercise the gate's cards — we mock its controller so init() lands the store on
// `localOnly` (the workspace renders normally), keeping these tests focused on the shell + i18n.
// The gate's own behavior is covered in src/components/configsync/ConfigSyncGate.test.tsx.
vi.mock('@/lib/config/configSyncController', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config/configSyncController')>()
  return {
    ...actual,
    createConfigSyncController: () => ({
      init: async () => actual.useConfigSyncStore.getState().set({ status: 'localOnly' }),
      setPassphrase: async () => {},
      unlock: async () => {},
      retry: async () => {},
      retrySync: async () => {},
      workLocalOnly: () => {},
      dispose: () => {},
    }),
  }
})

beforeEach(() => {
  useConfigSyncStore.getState().reset()
})

// Exhaustive by construction: adding an ErrorKind to the union without an entry here is a
// compile error, forcing its i18n key to be covered below.
const ALL_ERROR_KINDS: Record<ErrorKind, true> = {
  rateLimited: true,
  providerDown: true,
  unreachable: true,
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
  it('renders the Lucid Workspace shell', async () => {
    render(<App />)
    // The gate resolves init() to `localOnly` (mocked), then the workspace mounts.
    expect(await screen.findByText('Lucid')).toBeInTheDocument()
    // Exact name — "Open Settings" (the auto-run disabled-reason link) also matches /settings/i.
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
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

// WI-2 — next-themes ThemeProvider follows the OS via the .dark class strategy (rule 34).
describe('App theme (system / next-themes)', () => {
  const realMatchMedia = window.matchMedia
  beforeEach(() => {
    document.documentElement.className = '' // no localStorage in this env — next-themes uses matchMedia
  })
  afterEach(() => {
    window.matchMedia = realMatchMedia
    document.documentElement.className = ''
  })

  const mockPrefersDark = (dark: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: dark && query.includes('dark'),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    })) as unknown as typeof window.matchMedia
  }

  it('applies the .dark class when the OS prefers dark', async () => {
    mockPrefersDark(true)
    render(<App />)
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))
  })

  it('does not apply .dark when the OS prefers light', async () => {
    mockPrefersDark(false)
    render(<App />)
    await waitFor(() => expect(screen.getByText('Lucid')).toBeInTheDocument())
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

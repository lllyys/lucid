// WI-4 — TranslatePanel source word-lookup wiring (feature #169): the ⌕ toggle arms a mirror
// overlay over the source textarea; an armed word click opens a lookup owned by 'translateSource'
// with the detected direction's src→tgt langs (en→zh for Latin source). A disarmed field stays
// edit-only (caret sacred).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
vi.mock('@/components/workspace/notify', () => ({ notify: vi.fn() }))
const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))

import '@/i18n'
import { TranslatePanel } from './TranslatePanel'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
import { useAutoRunStore } from '@/stores/autoRunStore'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'
import { __resetAutoRecord } from '@/lib/sessions/autoRecord'
import { useLookupStore } from '@/stores/lookupStore'

beforeEach(() => {
  lookupMock.lookup.mockReset()
  lookupMock.close.mockReset()
  useProviderStore.getState().reset()
  __resetSessionIds()
  useSessionStore.getState().reset()
  __resetAutoRecord()
  useAutoRunStore.getState().reset()
  useOperationStore.getState().reset('translate')
  useLookupStore.getState().close()
})

describe('TranslatePanel — source word-lookup', () => {
  it('arms the source overlay via the ⌕ toggle and opens a translateSource lookup on a word', async () => {
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText('Source'), 'Hello world')
    await user.click(screen.getByRole('button', { name: /^toggle word lookup$/i }))
    // typing debounce settles (~400 ms) → the armed word span appears.
    const worldBtn = await screen.findByRole('button', { name: 'world' })
    await user.click(worldBtn)
    expect(lookupMock.lookup).toHaveBeenCalledWith(
      expect.objectContaining({ word: 'world', owner: 'translateSource', sourceLang: 'en', targetLang: 'zh' }),
    )
  })

  it('keeps the source edit-only (no clickable word spans) until lookup is toggled on', async () => {
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText('Source'), 'Hello world')
    // No toggle → the source words are not interactive (a bare click lands the caret).
    expect(screen.queryByRole('button', { name: 'world' })).not.toBeInTheDocument()
  })
})

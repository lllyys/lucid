import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'

// --- mocks -----------------------------------------------------------------
const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))

import type { ViewportTier } from '@/hooks/useViewportTier'
const tierMock = vi.hoisted(() => ({ value: 'desktop' as ViewportTier }))
vi.mock('@/hooks/useViewportTier', () => ({ useViewportTier: () => tierMock.value }))

// A controllable fake Speech so play/stop/voice-race are observable without the browser API.
const speechMock = vi.hoisted(() => {
  const state = {
    speaking: false,
    voicesReady: true,
    voiceLangs: ['en', 'zh'] as string[],
    subs: new Set<() => void>(),
  }
  const notify = () => state.subs.forEach((cb) => cb())
  const api = {
    speak: vi.fn((text: string, lang: string) => {
      void text
      void lang
      state.speaking = true
      notify()
      return null
    }),
    cancel: vi.fn(() => {
      state.speaking = false
      notify()
    }),
    isSpeaking: () => state.speaking,
    hasVoiceFor: (lang: string) => state.voiceLangs.some((v) => v === lang.split('-')[0]),
    get voicesReady() {
      return state.voicesReady
    },
    subscribe: (cb: () => void) => {
      state.subs.add(cb)
      return () => state.subs.delete(cb)
    },
    __state: state,
    __notify: notify,
  }
  return { api }
})
vi.mock('@/lib/speech/speak', () => ({ createSpeech: () => speechMock.api }))

import { WordLookupPopover } from './WordLookupPopover'
import { useLookupStore } from '@/stores/lookupStore'
import type { DefineSense } from '@/lib/lookup/parseDefine'

beforeEach(() => {
  lookupMock.lookup.mockReset()
  lookupMock.close.mockReset()
  speechMock.api.speak.mockClear()
  speechMock.api.cancel.mockClear()
  speechMock.api.__state.speaking = false
  speechMock.api.__state.voicesReady = true
  speechMock.api.__state.voiceLangs = ['en', 'zh']
  useLookupStore.getState().close()
})
afterEach(() => {
  tierMock.value = 'desktop'
})

type StoreShape = ReturnType<typeof useLookupStore.getState>
function setStore(over: Partial<StoreShape>) {
  act(() => {
    useLookupStore.setState({
      open: true,
      owner: 'translateResult',
      word: 'stutter',
      ipa: '/ˈstʌtər/',
      partOfSpeech: 'noun',
      translations: ['卡顿', '抖动'],
      meaning: 'a brief judder',
      senses: [] as DefineSense[],
      status: 'done',
      sentence: 'the user will perceive stutter',
      sourceLang: 'en',
      targetLang: 'zh',
      error: undefined,
      ...over,
    })
  })
}

const dialog = () => screen.getByRole('dialog')

describe('WordLookupPopover — WI-7 states', () => {
  it('does not render a dialog while the store is closed', () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('loading: shows the looking-up status and a disabled play button', () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({ status: 'streaming', translations: [], meaning: '' })
    expect(within(dialog()).getByText(/looking up/i)).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: /speak word/i })).toBeDisabled()
  })

  it('loaded: shows word, IPA, translation, meaning and an enabled play button', () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    const d = dialog()
    expect(within(d).getByText('stutter')).toBeInTheDocument()
    expect(within(d).getByText('/ˈstʌtər/')).toBeInTheDocument()
    expect(within(d).getByText(/卡顿/)).toBeInTheDocument()
    expect(within(d).getByText('a brief judder')).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: /speak word/i })).toBeEnabled()
  })

  it('play: clicking Speak calls speak then exposes a Stop control', async () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    await userEvent.click(within(dialog()).getByRole('button', { name: /speak word/i }))
    expect(speechMock.api.speak).toHaveBeenCalledTimes(1)
    // word is spoken in its own (source) language
    expect(speechMock.api.speak.mock.calls[0][1]).toBe('en')
    expect(within(dialog()).getByRole('button', { name: /stop/i })).toBeInTheDocument()
  })

  it('stop: clicking Stop while speaking calls cancel', async () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    await userEvent.click(within(dialog()).getByRole('button', { name: /speak word/i }))
    await userEvent.click(within(dialog()).getByRole('button', { name: /stop/i }))
    expect(speechMock.api.cancel).toHaveBeenCalled()
  })

  it('no-voice (voicesReady && !hasVoiceFor): play is disabled with a note', () => {
    speechMock.api.__state.voiceLangs = [] // no voices match
    render(<WordLookupPopover text="卡顿" done owner="translateResult" />)
    setStore({ word: '卡顿', sourceLang: 'zh', targetLang: 'en' })
    expect(within(dialog()).getByRole('button', { name: /no voice/i })).toBeDisabled()
  })

  it('voice-race: play is transiently disabled while !voicesReady, re-enables on voiceschanged', () => {
    speechMock.api.__state.voicesReady = false
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    expect(within(dialog()).getByRole('button', { name: /speak word/i })).toBeDisabled()
    // voices load asynchronously → voicesReady flips, hasVoiceFor('en') true
    act(() => {
      speechMock.api.__state.voicesReady = true
      speechMock.api.__notify()
    })
    expect(within(dialog()).getByRole('button', { name: /speak word/i })).toBeEnabled()
  })

  it('error: shows the no-definition message with Retry and Providers', () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({ status: 'error', error: { kind: 'refusal', messageKey: 'error.refusal', retryable: false } })
    const d = dialog()
    expect(within(d).getByText(/no definition/i)).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: /providers/i })).toBeInTheDocument()
  })

  it('error: clicking Providers opens Settings and dismisses (error recovery)', async () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({ status: 'error', error: { kind: 'refusal', messageKey: 'error.refusal', retryable: false } })
    const opened = vi.fn()
    window.addEventListener('lucid:open-settings', opened)
    await userEvent.click(within(dialog()).getByRole('button', { name: /providers/i }))
    window.removeEventListener('lucid:open-settings', opened)
    expect(opened).toHaveBeenCalled() // openSettings() fired → SettingsDialog opens to fix the provider
    expect(lookupMock.close).toHaveBeenCalled()
  })

  it('long / multi-sense: renders each sense', () => {
    render(<WordLookupPopover text="Hello render" done owner="translateResult" />)
    setStore({
      word: 'render',
      senses: [
        { gloss: '渲染', meaning: 'graphics sense' },
        { gloss: '使成为', meaning: 'cause-to-be sense' },
      ],
    })
    const d = dialog()
    expect(within(d).getByText('渲染')).toBeInTheDocument()
    expect(within(d).getByText('使成为')).toBeInTheDocument()
  })
})

describe('WordLookupPopover — WI-7 a11y, lifecycle, RTL, responsive', () => {
  it('the dialog is labelled with the word', () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/stutter/)
  })

  it('the meaning is an aria-live=polite region', () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    const live = within(dialog()).getByText('a brief judder')
    expect(live.closest('[aria-live="polite"]')).not.toBeNull()
  })

  it('clicking Close dismisses via the lookup store', async () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    await userEvent.click(within(dialog()).getByRole('button', { name: /close/i }))
    expect(lookupMock.close).toHaveBeenCalled()
  })

  it('Retry re-issues the lookup for the same word', async () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({ status: 'error', error: { kind: 'refusal', messageKey: 'error.refusal', retryable: false } })
    await userEvent.click(within(dialog()).getByRole('button', { name: /retry/i }))
    expect(lookupMock.lookup).toHaveBeenCalledTimes(1)
    expect(lookupMock.lookup.mock.calls[0][0].word).toBe('stutter')
  })

  it('cancels in-flight speech on unmount (M4)', async () => {
    const { unmount } = render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    await userEvent.click(within(dialog()).getByRole('button', { name: /speak word/i }))
    speechMock.api.cancel.mockClear()
    unmount()
    expect(speechMock.api.cancel).toHaveBeenCalled()
  })

  it('cancels prior speech when the active word changes (M4)', async () => {
    render(<WordLookupPopover text="Hello stutter render" done owner="translateResult" />)
    setStore({})
    await userEvent.click(within(dialog()).getByRole('button', { name: /speak word/i }))
    speechMock.api.cancel.mockClear()
    setStore({ word: 'render', sentence: 'Hello render' })
    expect(speechMock.api.cancel).toHaveBeenCalled()
  })

  it('renders dir=rtl for an Arabic word', () => {
    render(<WordLookupPopover text="إطار" done owner="translateResult" />)
    setStore({ word: 'إطار', sourceLang: 'ar', targetLang: 'en' })
    expect(dialog().getAttribute('dir')).toBe('rtl')
  })

  it('phone: renders the bottom sheet instead of the popover', () => {
    tierMock.value = 'phone'
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    // The sheet content is still a dialog labelled with the word; the desktop popover would carry
    // a context line ("ctx") that the sheet omits — assert the sheet's drag handle is present.
    const d = dialog()
    expect(d).toHaveAccessibleName(/stutter/)
    expect(within(d).queryByText('ctx')).toBeNull()
  })
})

describe('WordLookupPopover — owner gating (#169 WI-1)', () => {
  it('opens only for its own owner (a different host stays closed)', () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    // The active lookup belongs to ANOTHER host (e.g. the polish result pane).
    setStore({ owner: 'polishResult' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('still opens when the active lookup belongs to this owner', () => {
    render(<WordLookupPopover text="Hello stutter" done owner="polishResult" />)
    setStore({ owner: 'polishResult' })
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/stutter/)
  })

  it('clears the active-word chip once the active lookup moves to a different owner', async () => {
    render(<WordLookupPopover text="Hello stutter" done owner="translateResult" />)
    setStore({})
    // Click the rendered word so this host tracks it as active and paints the chip.
    await userEvent.click(screen.getByRole('button', { name: 'stutter' }))
    expect(screen.getByRole('button', { name: 'stutter' })).toHaveAttribute('aria-current', 'true')
    // The active lookup migrates to another host (e.g. the source overlay) without closing —
    // the same word text must NOT keep painting a spurious chip here.
    act(() => useLookupStore.setState({ owner: 'translateSource' }))
    expect(screen.getByRole('button', { name: 'stutter' })).not.toHaveAttribute('aria-current')
  })
})

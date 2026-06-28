// WI-3 — EditableLookupOverlay: a mirror click-layer over a textarea (feature #169).
// jsdom returns 0-rects + default computed styles, so these assert BEHAVIOR not pixels:
// armed → word spans clickable → lookup({word,sentence,owner,targetLang}) + owner-gated host;
// not-armed → mirror root pointer-events:none, spans inert; active chip gated on store word+owner;
// RTL dir propagation; CJK (no-space) segmentation; scroll-sync mirrors scrollTop.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRef } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'

// --- mocks (mirror WordLookupPopover.test so the shared LookupCardHost renders cleanly) ------
const lookupMock = vi.hoisted(() => ({ lookup: vi.fn(), close: vi.fn() }))
vi.mock('@/hooks/useWordLookup', () => ({ useWordLookup: () => lookupMock }))

import type { ViewportTier } from '@/hooks/useViewportTier'
const tierMock = vi.hoisted(() => ({ value: 'desktop' as ViewportTier }))
vi.mock('@/hooks/useViewportTier', () => ({ useViewportTier: () => tierMock.value }))

const speechMock = vi.hoisted(() => {
  const state = { speaking: false, voicesReady: true, voiceLangs: ['en', 'zh'] as string[], subs: new Set<() => void>() }
  const notify = () => state.subs.forEach((cb) => cb())
  const api = {
    speak: vi.fn(() => { state.speaking = true; notify(); return null }),
    cancel: vi.fn(() => { state.speaking = false; notify() }),
    isSpeaking: () => state.speaking,
    hasVoiceFor: (lang: string) => state.voiceLangs.some((v) => v === lang.split('-')[0]),
    get voicesReady() { return state.voicesReady },
    subscribe: (cb: () => void) => { state.subs.add(cb); return () => state.subs.delete(cb) },
    __state: state,
  }
  return { api }
})
vi.mock('@/lib/speech/speak', () => ({ createSpeech: () => speechMock.api }))

import { EditableLookupOverlay } from './EditableLookupOverlay'
import { useLookupStore, type LookupOwner } from '@/stores/lookupStore'
import type { DefineSense } from '@/lib/lookup/parseDefine'

beforeEach(() => {
  lookupMock.lookup.mockReset()
  lookupMock.close.mockReset()
  speechMock.api.__state.speaking = false
  useLookupStore.getState().close()
})
afterEach(() => {
  tierMock.value = 'desktop'
})

function Harness({
  text,
  armed,
  dir,
  owner = 'translateSource',
  sourceLang = 'en',
  targetLang = 'zh',
}: {
  text: string
  armed: boolean
  dir?: string
  owner?: LookupOwner
  sourceLang?: string
  targetLang?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <div style={{ position: 'relative' }}>
      <textarea ref={ref} defaultValue={text} dir={dir} aria-label="field" />
      <EditableLookupOverlay
        textareaRef={ref}
        text={text}
        owner={owner}
        sourceLang={sourceLang}
        targetLang={targetLang}
        armed={armed}
      />
    </div>
  )
}

type StoreShape = ReturnType<typeof useLookupStore.getState>
function openStore(over: Partial<StoreShape>) {
  act(() => {
    useLookupStore.setState({
      open: true,
      owner: 'translateSource',
      word: 'world',
      ipa: '',
      partOfSpeech: '',
      translations: ['世界'],
      meaning: 'the earth',
      senses: [] as DefineSense[],
      status: 'done',
      sentence: 'hello world',
      sourceLang: 'en',
      targetLang: 'zh',
      error: undefined,
      ...over,
    })
  })
}

describe('EditableLookupOverlay — armed clicks', () => {
  it('renders a clickable word span per word when armed', () => {
    render(<Harness text="hello world" armed />)
    expect(screen.getByRole('button', { name: 'hello' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'world' })).toBeInTheDocument()
  })

  it('clicking an armed word calls lookup with word, sentence, owner and targetLang', async () => {
    render(<Harness text="hello world" armed owner="polishDraft" sourceLang="en" targetLang="fr" />)
    await userEvent.click(screen.getByRole('button', { name: 'world' }))
    expect(lookupMock.lookup).toHaveBeenCalledTimes(1)
    expect(lookupMock.lookup).toHaveBeenCalledWith(
      expect.objectContaining({
        word: 'world',
        sentence: 'hello world',
        owner: 'polishDraft',
        targetLang: 'fr',
        sourceLang: 'en',
      }),
    )
  })
})

describe('EditableLookupOverlay — not armed', () => {
  it('keeps the mirror root pointer-events:none and the word spans inert', () => {
    render(<Harness text="hello world" armed={false} />)
    const mirror = screen.getByTestId('lookup-mirror')
    expect(mirror.style.pointerEvents).toBe('none')
    // No interactive word buttons exist while disarmed.
    expect(screen.queryByRole('button', { name: 'world' })).not.toBeInTheDocument()
    // Even a low-level dispatched click on the bare word glyphs triggers no lookup — there is no
    // handler attached, so the click falls through to the field beneath (caret stays sacred).
    fireEvent.click(screen.getByText('world'))
    expect(lookupMock.lookup).not.toHaveBeenCalled()
  })
})

describe('EditableLookupOverlay — owner-gated host', () => {
  it('opens the LookupCardHost only for its own owner', () => {
    render(<Harness text="hello world" armed owner="translateSource" />)
    openStore({ owner: 'translateSource' })
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/world/)
  })

  it('stays closed when the active lookup belongs to a different host', () => {
    render(<Harness text="hello world" armed owner="translateSource" />)
    openStore({ owner: 'polishDraft' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('EditableLookupOverlay — active chip', () => {
  it('marks the span matching the store word + owner as active', () => {
    render(<Harness text="hello world" armed owner="translateSource" />)
    openStore({ owner: 'translateSource', word: 'world' })
    expect(screen.getByRole('button', { name: 'world' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'hello' })).not.toHaveAttribute('aria-current')
  })

  it('does not mark a chip when the active lookup belongs to another owner', () => {
    render(<Harness text="hello world" armed owner="translateSource" />)
    openStore({ owner: 'polishDraft', word: 'world' })
    expect(screen.getByRole('button', { name: 'world' })).not.toHaveAttribute('aria-current')
  })
})

describe('EditableLookupOverlay — RTL + CJK', () => {
  it('propagates the textarea dir onto the mirror (RTL)', () => {
    render(<Harness text="مرحبا بالعالم" armed dir="rtl" sourceLang="ar" />)
    expect(screen.getByTestId('lookup-mirror').getAttribute('dir')).toBe('rtl')
  })

  it('segments space-less CJK into clickable word spans', async () => {
    render(<Harness text="你好世界" armed sourceLang="zh" targetLang="en" />)
    // Intl.Segmenter splits 你好世界 into 你好 / 世界 — at least one clickable CJK word exists.
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
    await userEvent.click(buttons[0])
    expect(lookupMock.lookup).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'translateSource', targetLang: 'en' }),
    )
    expect(lookupMock.lookup.mock.calls[0][0].word).not.toContain(' ')
  })
})

describe('EditableLookupOverlay — scroll sync', () => {
  it('mirrors the textarea scrollTop on scroll', () => {
    render(<Harness text="hello world" armed />)
    const textarea = screen.getByLabelText('field') as HTMLTextAreaElement
    const mirror = screen.getByTestId('lookup-mirror')
    textarea.scrollTop = 42
    textarea.scrollLeft = 7
    fireEvent.scroll(textarea)
    expect(mirror.scrollTop).toBe(42)
    expect(mirror.scrollLeft).toBe(7)
  })
})

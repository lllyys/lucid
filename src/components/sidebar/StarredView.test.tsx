import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the speech boundary (feature #24) — one shared speak/cancel pair across SpeakButton mounts,
// with mutable voice state so the novoice path is exercised.
const speechMock = vi.hoisted(() => {
  const speak = vi.fn()
  const cancel = vi.fn()
  const state = { voicesReady: true, hasVoice: true, speaking: false }
  const create = () => ({
    get voicesReady() {
      return state.voicesReady
    },
    speak,
    cancel,
    isSpeaking: () => state.speaking,
    hasVoiceFor: () => state.hasVoice,
    subscribe: () => () => {},
  })
  return { speak, cancel, state, create }
})
vi.mock('@/lib/speech/speak', () => ({ createSpeech: speechMock.create }))

const loadMock = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/lib/workspace/loadSource', () => ({ loadSourceIntoWorkspace: loadMock.load }))

import '@/i18n'
import { StarredView } from './StarredView'
import { useStarredStore } from '@/stores/starredStore'

const seed = () => {
  const { star } = useStarredStore.getState()
  star({
    kind: 'word',
    source: 'stutter',
    translation: '卡顿',
    ipa: '/ˈstʌtər/',
    meaning: 'a brief judder',
    sourceLang: 'en',
    targetLang: 'zh',
    context: 'the user will perceive stutter',
  })
  star({
    kind: 'sentence',
    source: '渲染管线的每一帧都必须在十六毫秒内完成',
    translation: 'Every frame of the render pipeline must finish within sixteen milliseconds',
    sourceLang: 'zh',
    targetLang: 'en',
  })
}

beforeEach(() => {
  useStarredStore.getState().reset()
  speechMock.speak.mockClear()
  speechMock.cancel.mockClear()
  speechMock.state.voicesReady = true
  speechMock.state.hasVoice = true
  speechMock.state.speaking = false
  loadMock.load.mockClear()
})

describe('StarredView (WI-4 — the review surface)', () => {
  it('shows the empty state when nothing is starred', () => {
    render(<StarredView />)
    expect(screen.getByText(/nothing starred yet/i)).toBeInTheDocument()
  })

  it('lists word + sentence items with a count', () => {
    seed()
    render(<StarredView />)
    expect(screen.getByText('stutter')).toBeInTheDocument()
    expect(screen.getByText('渲染管线的每一帧都必须在十六毫秒内完成')).toBeInTheDocument()
    expect(screen.getByText('2 starred')).toBeInTheDocument()
  })

  it('search matches the SOURCE half', async () => {
    seed()
    render(<StarredView />)
    await userEvent.type(screen.getByRole('textbox', { name: /search starred/i }), 'stutter')
    expect(screen.getByText('stutter')).toBeInTheDocument()
    expect(screen.queryByText('渲染管线的每一帧都必须在十六毫秒内完成')).toBeNull()
  })

  it('search matches the TRANSLATION half', async () => {
    seed()
    render(<StarredView />)
    await userEvent.type(screen.getByRole('textbox', { name: /search starred/i }), 'render pipeline')
    expect(screen.getByText('渲染管线的每一帧都必须在十六毫秒内完成')).toBeInTheDocument()
    expect(screen.queryByText('stutter')).toBeNull()
  })

  it('search is CJK-safe (no whitespace assumption)', async () => {
    seed()
    render(<StarredView />)
    await userEvent.type(screen.getByRole('textbox', { name: /search starred/i }), '渲染')
    expect(screen.getByText('渲染管线的每一帧都必须在十六毫秒内完成')).toBeInTheDocument()
    expect(screen.queryByText('stutter')).toBeNull()
  })

  it('shows a no-results state with a Clear search that restores the list', async () => {
    seed()
    render(<StarredView />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /search starred/i }), 'parallax')
    expect(screen.getByText(/nothing starred matches/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear search/i }))
    expect(screen.getByText('stutter')).toBeInTheDocument()
  })

  it('opens a word detail (translation + meaning) and returns via the back link', async () => {
    seed()
    render(<StarredView />)
    const user = userEvent.setup()
    await user.click(screen.getByText('stutter'))
    expect(screen.getByText('卡顿')).toBeInTheDocument()
    expect(screen.getByText('a brief judder')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /all starred/i }))
    expect(screen.getByText('2 starred')).toBeInTheDocument()
  })

  it('shows the "From" context line in the word detail (the looked-up sentence)', async () => {
    seed()
    render(<StarredView />)
    await userEvent.click(screen.getByText('stutter'))
    expect(screen.getByText(/^from$/i)).toBeInTheDocument()
    expect(screen.getByText('the user will perceive stutter')).toBeInTheDocument()
  })

  it('omits the "From" line when a word has no stored context', async () => {
    useStarredStore.getState().star({
      kind: 'word', source: 'token', translation: '词元', sourceLang: 'en', targetLang: 'zh',
    })
    render(<StarredView />)
    await userEvent.click(screen.getByText('token'))
    expect(screen.queryByText(/^from$/i)).toBeNull()
  })

  it('opens a sentence detail showing the source → result pair', async () => {
    seed()
    render(<StarredView />)
    await userEvent.click(screen.getByText('渲染管线的每一帧都必须在十六毫秒内完成'))
    // both halves of the pair are present in the detail
    expect(
      screen.getByText('Every frame of the render pipeline must finish within sixteen milliseconds'),
    ).toBeInTheDocument()
  })

  it('renders an RTL (Arabic) row and its detail mirrored under dir=rtl', async () => {
    useStarredStore.getState().star({
      kind: 'word', source: 'إطار', translation: 'frame', sourceLang: 'ar', targetLang: 'en',
    })
    render(<StarredView />)
    const row = screen.getByText('إطار').closest('button')!
    expect(row).toHaveAttribute('dir', 'rtl')
    await userEvent.click(row)
    // the detail container mirrors too (logical inline-start/-end, rule 66 §3)
    expect(screen.getByText('frame').closest('[dir="rtl"]')).not.toBeNull()
  })

  it('Unstar in the detail removes the item and returns to the list', async () => {
    seed()
    render(<StarredView />)
    const user = userEvent.setup()
    await user.click(screen.getByText('stutter'))
    await user.click(screen.getByRole('button', { name: /unstar/i }))
    expect(useStarredStore.getState().items).toHaveLength(1)
    expect(screen.getByText('1 starred')).toBeInTheDocument()
    expect(screen.queryByText('stutter')).toBeNull()
  })
})

// WI-1 (feature #24) — the two starred-detail affordances: Speak (word only) + Open in workspace.
describe('StarredView — detail affordances (feature #24)', () => {
  it('word detail shows BOTH Speak and Open in workspace', async () => {
    seed()
    render(<StarredView />)
    await userEvent.click(screen.getByText('stutter'))
    expect(screen.getByRole('button', { name: /speak word/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open in workspace/i })).toBeInTheDocument()
  })

  it('sentence detail shows Open in workspace but NOT Speak (word-only)', async () => {
    seed()
    render(<StarredView />)
    await userEvent.click(screen.getByText('渲染管线的每一帧都必须在十六毫秒内完成'))
    expect(screen.getByRole('button', { name: /open in workspace/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /speak word/i })).toBeNull()
  })

  it('Open in workspace loads the item source via loadSourceIntoWorkspace', async () => {
    seed()
    render(<StarredView />)
    await userEvent.click(screen.getByText('stutter'))
    await userEvent.click(screen.getByRole('button', { name: /open in workspace/i }))
    expect(loadMock.load).toHaveBeenCalledTimes(1)
    expect(loadMock.load).toHaveBeenCalledWith('stutter')
  })

  it('Open in workspace on a sentence loads its source text', async () => {
    seed()
    render(<StarredView />)
    await userEvent.click(screen.getByText('渲染管线的每一帧都必须在十六毫秒内完成'))
    await userEvent.click(screen.getByRole('button', { name: /open in workspace/i }))
    expect(loadMock.load).toHaveBeenCalledWith('渲染管线的每一帧都必须在十六毫秒内完成')
  })

  it('Speak calls createSpeech.speak with the word source and language', async () => {
    seed()
    render(<StarredView />)
    await userEvent.click(screen.getByText('stutter'))
    await userEvent.click(screen.getByRole('button', { name: /speak word/i }))
    expect(speechMock.speak).toHaveBeenCalledWith('stutter', 'en')
  })

  it('Speak is rendered but DISABLED when no voice matches (novoice, not hidden)', async () => {
    speechMock.state.hasVoice = false // voices loaded, none match → permanent novoice
    seed()
    render(<StarredView />)
    await userEvent.click(screen.getByText('stutter'))
    expect(screen.getByRole('button', { name: /speak word/i })).toBeDisabled()
  })

  it('cancels in-flight speech when the word detail unmounts (no audio leak)', async () => {
    seed()
    const { unmount } = render(<StarredView />)
    await userEvent.click(screen.getByText('stutter'))
    unmount()
    expect(speechMock.cancel).toHaveBeenCalled()
  })
})

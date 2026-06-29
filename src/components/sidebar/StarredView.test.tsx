import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { StarButton } from './StarButton'
import { useStarredStore, type StarredInput } from '@/stores/starredStore'

const WORD: StarredInput = {
  kind: 'word',
  source: 'stutter',
  translation: '卡顿',
  ipa: '/ˈstʌtər/',
  meaning: 'a brief judder',
  sourceLang: 'en',
  targetLang: 'zh',
  context: 'the user will perceive stutter',
}
const SENTENCE: StarredInput = {
  kind: 'sentence',
  source: 'Hello world',
  translation: '你好世界',
  sourceLang: 'en',
  targetLang: 'zh',
}

beforeEach(() => {
  useStarredStore.getState().reset()
})

describe('StarButton (WI-3 — the star toggle)', () => {
  it('stars on click and reflects the starred state (pill)', async () => {
    render(<StarButton input={SENTENCE} variant="pill" />)
    const btn = screen.getByRole('button', { name: 'Star' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(btn)
    const items = useStarredStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'sentence', source: 'Hello world', translation: '你好世界' })
    expect(screen.getByRole('button', { name: 'Starred' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('unstars on a second click (it is a toggle)', async () => {
    render(<StarButton input={WORD} variant="icon" />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Star' }))
    expect(useStarredStore.getState().items).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Starred' }))
    expect(useStarredStore.getState().items).toHaveLength(0)
  })

  it('reflects an already-starred item on mount (content scan, not id)', () => {
    useStarredStore.getState().star(WORD)
    render(<StarButton input={WORD} variant="icon" />)
    expect(screen.getByRole('button', { name: 'Starred' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('icon variant exposes its label via aria-label (no visible text)', () => {
    render(<StarButton input={WORD} variant="icon" />)
    const btn = screen.getByRole('button', { name: 'Star' })
    expect(btn).toHaveAttribute('aria-label', 'Star')
  })

  it('does not double-star identical content (store dedupe survives a re-render)', async () => {
    const { rerender } = render(<StarButton input={SENTENCE} variant="pill" />)
    await userEvent.click(screen.getByRole('button', { name: 'Star' }))
    rerender(<StarButton input={{ ...SENTENCE }} variant="pill" />)
    // an equal-by-content input still reads as starred and never adds a second row
    expect(screen.getByRole('button', { name: 'Starred' })).toBeInTheDocument()
    expect(useStarredStore.getState().items).toHaveLength(1)
  })
})

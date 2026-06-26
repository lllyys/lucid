import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClickableText } from './ClickableText'

const baseProps = {
  text: 'Hello world',
  interactive: true,
  sourceLang: 'en',
  targetLang: 'zh',
  locale: 'en',
  activeWord: null as { word: string; offset: number } | null,
  onActivate: vi.fn(),
}

describe('ClickableText', () => {
  it('renders word tokens as role=button spans when interactive', () => {
    render(<ClickableText {...baseProps} onActivate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'world' })).toBeInTheDocument()
  })

  it('renders PLAIN text (no buttons) when NOT interactive (streaming)', () => {
    render(<ClickableText {...baseProps} interactive={false} onActivate={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // the text is still present
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it('emits {word, sentence, offset, sourceLang, targetLang} on click', async () => {
    const onActivate = vi.fn()
    render(<ClickableText {...baseProps} onActivate={onActivate} />)
    await userEvent.click(screen.getByRole('button', { name: 'world' }))
    expect(onActivate).toHaveBeenCalledWith(
      expect.objectContaining({ word: 'world', offset: 6, sourceLang: 'en', targetLang: 'zh' }),
    )
    // the sentence carries the clicked word
    expect(onActivate.mock.calls[0][0].sentence).toContain('world')
  })

  it('activates on Enter and Space via keyboard', async () => {
    const onActivate = vi.fn()
    render(<ClickableText {...baseProps} onActivate={onActivate} />)
    const word = screen.getByRole('button', { name: 'Hello' })
    word.focus()
    await userEvent.keyboard('{Enter}')
    expect(onActivate).toHaveBeenCalledTimes(1)
    await userEvent.keyboard(' ')
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it('does not make punctuation/whitespace clickable', () => {
    render(<ClickableText {...baseProps} text="a, b." onActivate={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['a', 'b'])
  })

  it('highlights the active word (aria-current) and only that one', () => {
    render(
      <ClickableText
        {...baseProps}
        text="Hello world"
        activeWord={{ word: 'world', offset: 6 }}
        onActivate={vi.fn()}
      />,
    )
    const active = screen.getByRole('button', { name: 'world' })
    expect(active).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Hello' })).not.toHaveAttribute('aria-current', 'true')
  })

  it('renders CJK text with clickable word tokens', () => {
    render(<ClickableText {...baseProps} text="你好世界" locale="zh" onActivate={vi.fn()} />)
    // at least one CJK word becomes a button (segmenter yields word-like tokens)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('sets dir=auto for bidi safety', () => {
    const { container } = render(<ClickableText {...baseProps} text="مرحبا بالعالم" locale="ar" onActivate={vi.fn()} />)
    expect(container.querySelector('[dir="auto"]')).not.toBeNull()
  })

  it('emits the offset matching the clicked token for a repeated word', async () => {
    const onActivate = vi.fn()
    render(<ClickableText {...baseProps} text="go go" onActivate={onActivate} />)
    const buttons = screen.getAllByRole('button', { name: 'go' })
    await userEvent.click(buttons[1])
    expect(onActivate.mock.calls[0][0].offset).toBe(3) // the SECOND "go"
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/workspace/loadSource', () => ({ loadSourceIntoWorkspace: vi.fn() }))
import { loadSourceIntoWorkspace } from '@/lib/workspace/loadSource'
import '@/i18n'
import { TaskReadView } from './TaskReadView'
import type { Task } from '@/stores/sessionStore'

const mockLoad = vi.mocked(loadSourceIntoWorkspace)
const writeText = vi.fn()

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  kind: 'translate',
  title: 'Hello world',
  sourceText: 'Hello world',
  resultText: 'Hola mundo',
  createdAt: Date.now() - 20 * 60 * 1000, // 20 minutes ago
  updatedAt: Date.now(),
  deletedAt: null,
  ...over,
})

beforeEach(() => {
  mockLoad.mockReset()
  writeText.mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('TaskReadView (feature #25, WI-3)', () => {
  it('renders a translate task with Source + Result blocks and the direction + latency', () => {
    render(<TaskReadView task={makeTask({ sourceLang: 'en', targetLang: 'zh', durationMs: 1500 })} sessionName="Doc" onBack={() => {}} />)
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getByText('Result')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('Hola mundo')).toBeInTheDocument()
    expect(screen.getByText('EN → 中')).toBeInTheDocument()
    expect(screen.getByText('1.5s')).toBeInTheDocument()
    expect(screen.getByText(/20m ago/)).toBeInTheDocument()
  })

  it('renders a polish task with Original + Polished + Keywords-kept chips', () => {
    render(
      <TaskReadView
        task={makeTask({ kind: 'polish', sourceText: 'rough', resultText: 'polished', keywords: ['inference', 'latency'] })}
        sessionName="Doc"
        onBack={() => {}}
      />,
    )
    expect(screen.getByText('Original')).toBeInTheDocument()
    // "Polished" labels both the header kind and the result block — at least one is present.
    expect(screen.getAllByText('Polished').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Keywords kept')).toBeInTheDocument()
    expect(screen.getByText('inference')).toBeInTheDocument()
    expect(screen.getByText('latency')).toBeInTheDocument()
  })

  it('omits direction, latency and keywords when absent (old/synced task degrades)', () => {
    render(<TaskReadView task={makeTask()} sessionName="Doc" onBack={() => {}} />)
    expect(screen.queryByText(/→/)).toBeNull() // no direction arrow
    expect(screen.queryByText(/\ds$/)).toBeNull() // no "1.5s" latency token
    expect(screen.queryByText('Keywords kept')).toBeNull()
  })

  it('shows the missing-result edge and disables Copy when resultText is empty', () => {
    render(<TaskReadView task={makeTask({ resultText: '' })} sessionName="Doc" onBack={() => {}} />)
    expect(screen.getByText("Result wasn't saved")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeDisabled()
  })

  it('Copy writes the result text to the clipboard', () => {
    // fireEvent (not userEvent) — userEvent.setup() installs its own clipboard stub that would shadow ours.
    render(<TaskReadView task={makeTask({ resultText: 'Hola mundo' })} sessionName="Doc" onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('Hola mundo')
  })

  it('Open in workspace loads the source text into the editor (feature #24)', async () => {
    const user = userEvent.setup()
    render(<TaskReadView task={makeTask({ sourceText: 'Hello world' })} sessionName="Doc" onBack={() => {}} />)
    await user.click(screen.getByRole('button', { name: /open in workspace/i }))
    expect(mockLoad).toHaveBeenCalledWith('Hello world')
  })

  it('the back link invokes onBack with the session name', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<TaskReadView task={makeTask()} sessionName="Physics paper" onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: /physics paper/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('resolves an RTL base direction from the source text (Arabic → rtl), even when sourceLang is absent', () => {
    render(<TaskReadView task={makeTask({ sourceText: 'مرحبا بالعالم', resultText: 'Hello' })} sessionName="Doc" onBack={() => {}} />)
    expect(screen.getByText('مرحبا بالعالم').getAttribute('dir')).toBe('rtl')
  })

  it('resolves an LTR base direction for Latin source text', () => {
    render(<TaskReadView task={makeTask({ sourceText: 'Hello world' })} sessionName="Doc" onBack={() => {}} />)
    expect(screen.getByText('Hello world').getAttribute('dir')).toBe('ltr')
  })
})

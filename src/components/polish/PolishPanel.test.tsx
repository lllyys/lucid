import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
vi.mock('@/components/workspace/notify', () => ({ notify: vi.fn() }))
import { createProvider } from '@/providers'
import { notify } from '@/components/workspace/notify'
import '@/i18n'
import { PolishPanel } from './PolishPanel'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
import type { LLMProvider, LLMRequest, ProviderOutcome, StreamChunk } from '@/providers/types'

const mockCreate = vi.mocked(createProvider)
const mockNotify = vi.mocked(notify)
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

// One provider whose stream output depends on the request kind (translate vs polish).
function smartProvider(): LLMProvider {
  async function* streamOp(req: LLMRequest): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    const text = req.kind === 'translate' ? 'translated draft' : 'polished result'
    yield { text }
    return { status: 'done', text }
  }
  return {
    vendor: 'anthropic',
    model: 'm',
    stream: (req) => streamOp(req),
    streamOp: (req) => streamOp(req),
    translate: async () => ({ status: 'done', text: '' }),
    polish: async () => ({ status: 'done', text: '' }),
  }
}

beforeEach(() => {
  mockCreate.mockReset()
  mockNotify.mockReset()
  useProviderStore.getState().reset()
  useProviderStore.getState().setApiKey('sk-test')
  const ops = useOperationStore.getState()
  ops.reset('polish')
  ops.reset('draftTranslate')
})

describe('PolishPanel', () => {
  it('renders the three input regions and no "+ from glossary" control (feature #3)', () => {
    render(<PolishPanel />)
    expect(screen.getByRole('textbox', { name: 'Original' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'add keyword' })).toBeInTheDocument()
    expect(screen.queryByText(/from glossary/i)).toBeNull()
  })

  it('adds a keyword via Enter and removes it via ×', async () => {
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'add keyword' }), 'inference{Enter}')
    expect(screen.getByText('inference')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove inference/i }))
    expect(screen.queryByText('inference')).toBeNull()
  })

  it('streams "Translate original" into the draft', async () => {
    mockCreate.mockReturnValue(smartProvider())
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Original' }), '原文')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /translate original/i }))
      await tick()
    })
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('translated draft')
  })

  it('polishes the draft, then Accept commits the result to the draft and toasts', async () => {
    mockCreate.mockReturnValue(smartProvider())
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'rough draft text')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^polish$/i }))
      await tick()
    })
    expect(screen.getByText('polished result')).toBeInTheDocument()

    // Compare toggle works
    await user.click(screen.getByRole('button', { name: /compare/i }))
    expect(screen.getByRole('button', { name: /compare/i })).toHaveAttribute('aria-pressed', 'true')

    // Accept commits the polished result to the draft + confirmation toast
    await user.click(screen.getByRole('button', { name: /^accept$/i }))
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('polished result')
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })
})

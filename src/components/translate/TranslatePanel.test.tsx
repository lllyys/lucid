import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
vi.mock('@/components/workspace/notify', () => ({ notify: vi.fn() }))
import { createProvider } from '@/providers'
import { notify } from '@/components/workspace/notify'
import '@/i18n'
import { TranslatePanel } from './TranslatePanel'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
import type { LLMProvider, ProviderOutcome, StreamChunk } from '@/providers/types'

const mockCreate = vi.mocked(createProvider)
const mockNotify = vi.mocked(notify)
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

function okProvider(text: string): LLMProvider {
  async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    yield { text }
    return { status: 'done', text }
  }
  return {
    vendor: 'anthropic',
    model: 'm',
    stream: () => streamOp(),
    streamOp: () => streamOp(),
    translate: async () => ({ status: 'done', text }),
    polish: async () => ({ status: 'done', text }),
  }
}

beforeEach(() => {
  mockCreate.mockReset()
  mockNotify.mockReset()
  useProviderStore.getState().reset()
  useOperationStore.getState().reset('translate')
  useOperationStore.setState({ translate: { status: 'idle', startedAt: null, elapsedMs: null, runId: 0 } })
})

describe('TranslatePanel', () => {
  it('detects the direction live from the source text', async () => {
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText(/source/i), '你好')
    expect(screen.getByText('中文')).toBeInTheDocument()
    expect(screen.getByText('English')).toBeInTheDocument()
  })

  it('streams a translation on Run (mocked provider) and shows Copy/Accept when done', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(okProvider('Hola mundo'))
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText(/source/i), 'Hello world')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^translate$/i }))
      await tick()
    })
    expect(screen.getByText('Hola mundo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument()
  })

  // Regression (Gate-4 High-2): Accept used to be a false-success no-op — it toasted
  // but never committed the result. It must commit the working translation AND reflect
  // the accepted state (rule 66 §2).
  it('Accept commits the translation and reflects the accepted state', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(okProvider('Hola mundo'))
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText(/source/i), 'Hello world')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^translate$/i }))
      await tick()
    })
    await user.click(screen.getByRole('button', { name: /^accept$/i }))
    // committed → button flips to the accepted label, and the confirmation toast fired
    expect(screen.getByRole('button', { name: 'Accepted ✓' })).toBeInTheDocument()
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('Clear empties the source textarea', async () => {
    const user = userEvent.setup()
    render(<TranslatePanel />)
    const ta = screen.getByLabelText(/source/i)
    await user.type(ta, 'text')
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(ta).toHaveValue('')
  })
})

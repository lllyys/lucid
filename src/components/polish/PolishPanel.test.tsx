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
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'
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

// A "Translate original" stream that yields one chunk, then stalls on a gate the test
// controls — so the test can interleave a user edit / Stop click while it is mid-stream.
function gatedTranslateProvider(): { provider: LLMProvider; release: () => void } {
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  async function* streamOp(req: LLMRequest): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    if (req.kind === 'translate') {
      yield { text: 'partial' }
      await gate
      yield { text: ' more' }
      return { status: 'done', text: 'partial more' }
    }
    yield { text: 'polished result' }
    return { status: 'done', text: 'polished result' }
  }
  const provider: LLMProvider = {
    vendor: 'anthropic',
    model: 'm',
    stream: (req) => streamOp(req),
    streamOp: (req) => streamOp(req),
    translate: async () => ({ status: 'done', text: '' }),
    polish: async () => ({ status: 'done', text: '' }),
  }
  return { provider, release }
}

beforeEach(() => {
  mockCreate.mockReset()
  mockNotify.mockReset()
  useProviderStore.getState().reset()
  useProviderStore.getState().setApiKey('sk-test')
  usePolishKeywordsStore.getState().reset()
  __resetSessionIds()
  useSessionStore.getState().reset()
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

  // Regression (Gate-4 High-1): a stale "Translate original" stream used to overwrite newer
  // user input because editing the draft didn't reset/abort the draftTranslate op. Editing now
  // resets it so a superseded stream can never clobber the edit.
  it('editing the draft mid-translate aborts the stale stream so it cannot overwrite the edit', async () => {
    const { provider, release } = gatedTranslateProvider()
    mockCreate.mockReturnValue(provider)
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Original' }), '原文')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /translate original/i }))
      await tick()
    })
    const draftBox = screen.getByRole('textbox', { name: 'Draft to polish' })
    expect(draftBox).toHaveValue('partial') // first chunk mirrored into the draft

    // User overrides the draft while the stream is still in flight.
    await user.clear(draftBox)
    await user.type(draftBox, 'my own edit')

    // Releasing the stalled stream must NOT bring back the stale chunk / done text.
    await act(async () => {
      release()
      await tick()
    })
    expect(draftBox).toHaveValue('my own edit')
  })

  // Regression (Gate-4 High-1): there was no way to stop a runaway "Translate original".
  it('shows a Stop control while translating the original and aborts it on click', async () => {
    const { provider, release } = gatedTranslateProvider()
    mockCreate.mockReturnValue(provider)
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Original' }), '原文')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /translate original/i }))
      await tick()
    })
    expect(screen.getByText('translating…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^stop$/i }))
    // aborted → translating note gone, the action reverts to "Translate original", partial kept
    expect(screen.queryByText('translating…')).toBeNull()
    expect(screen.getByRole('button', { name: /translate original/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('partial')
    await act(async () => {
      release()
      await tick()
    })
  })

  // Regression (Gate-4 round-2 High): starting "Translate original" while a polish result is on
  // screen used to leave that result actionable — accepting it mid-translate let the stream
  // overwrite the accepted draft. A new translation now invalidates the stale polish result.
  it('starting Translate original clears a prior polish result so it cannot be accepted mid-translate', async () => {
    const { provider, release } = gatedTranslateProvider()
    mockCreate.mockReturnValue(provider)
    const user = userEvent.setup()
    render(<PolishPanel />)
    // Produce a polish result (done) — its Accept button is showing.
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'rough draft text')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^polish$/i }))
      await tick()
    })
    expect(screen.getByText('polished result')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeInTheDocument()

    // Start "Translate original" — the stale polish result + its Accept must clear.
    await user.type(screen.getByRole('textbox', { name: 'Original' }), '原文')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /translate original/i }))
      await tick()
    })
    expect(screen.queryByText('polished result')).toBeNull()
    expect(screen.queryByRole('button', { name: /^accept$/i })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('partial')
    await act(async () => {
      release()
      await tick()
    })
  })

  // WI-6: a keyword change (here or from the sidebar glossary) invalidates a showing polish result.
  it('a keyword change resets a showing polish result', async () => {
    mockCreate.mockReturnValue(smartProvider())
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'rough draft text')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^polish$/i }))
      await tick()
    })
    expect(screen.getByText('polished result')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'add keyword' }), 'inference{Enter}')
    expect(useOperationStore.getState().polish.status).toBe('idle')
    expect(screen.queryByText('polished result')).toBeNull()
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
    // WI-7: the accepted polish is recorded as a task in a (auto-created) session
    const sessions = useSessionStore.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tasks[0]).toMatchObject({ kind: 'polish', resultText: 'polished result' })
  })
})

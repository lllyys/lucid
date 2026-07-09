import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
vi.mock('@/components/workspace/notify', () => ({ notify: vi.fn() }))
import { createProvider } from '@/providers'
import { notify } from '@/components/workspace/notify'
import '@/i18n'
import { PolishPanel } from './PolishPanel'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
import { useLookupStore } from '@/stores/lookupStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'
import { useAutoRunStore } from '@/stores/autoRunStore'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'
import { __resetAutoRecord } from '@/lib/sessions/autoRecord'
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
  useAutoRunStore.getState().reset()
  __resetSessionIds()
  useSessionStore.getState().reset()
  __resetAutoRecord() // feature #14 — clear the per-panel auto-record dedup map between tests
  useLookupStore.getState().close()
  const ops = useOperationStore.getState()
  ops.reset('polish')
  ops.reset('draftTranslate')
})

// Clear buttons scoped to one editor card. The DRAFT header dual-renders a phone + desktop Clear
// (both present in jsdom — no CSS loaded), and both polish cards now carry a Clear, so a bare
// getByRole('button', { name: 'Clear' }) is ambiguous — scope by the card that owns the textbox.
function clearButtonsIn(name: 'Original' | 'Draft to polish'): HTMLElement[] {
  const card = screen.getByRole('textbox', { name }).closest('.rounded-\\[14px\\]') as HTMLElement
  return within(card).getAllByRole('button', { name: /clear/i })
}

// A polish stream that yields one chunk then stalls on a test-controlled gate, so a Clear can be
// clicked while the polish op is mid-stream (translate stays a one-shot).
function gatedPolishProvider(): { provider: LLMProvider; release: () => void } {
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  async function* streamOp(req: LLMRequest): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    if (req.kind === 'polish') {
      yield { text: 'partial polish' }
      await gate
      yield { text: ' more' }
      return { status: 'done', text: 'partial polish more' }
    }
    yield { text: 'translated draft' }
    return { status: 'done', text: 'translated draft' }
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

describe('PolishPanel', () => {
  it('renders the three input regions and no "+ from glossary" control (feature #3)', () => {
    render(<PolishPanel />)
    expect(screen.getByRole('textbox', { name: 'Original' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'add keyword' })).toBeInTheDocument()
    expect(screen.queryByText(/from glossary/i)).toBeNull()
  })

  // WI-3 / #17 H7 — on phone, neither Polish column owns a scrollbar: the input column's
  // overflow-auto is gated to ≥600 (min-[600px]:overflow-auto, never the bare class), and the
  // result column has no independent overflow. `<main>` is the single scroll region on phone.
  it('does not give either Polish column an unconditional scroll on phone', () => {
    const { container } = render(<PolishPanel />)
    // The input column is the editor stack (flex-col + p-4); it scrolls only at ≥600 — not
    // unconditionally (which would nest a scroll on phone).
    const inputColumn = container.querySelector('div.flex-col.p-4')!
    expect(inputColumn.className).toContain('min-[600px]:overflow-auto')
    expect(inputColumn.className.split(/\s+/)).not.toContain('overflow-auto')
    // The result column never declares its own overflow scroll at any tier.
    const resultColumn = container.querySelector('section.border-l')!
    expect(resultColumn.className).not.toContain('overflow-auto')
    expect(resultColumn.className).not.toContain('overflow-scroll')
  })

  it('adds a keyword via Enter and removes it via ×', async () => {
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'add keyword' }), 'inference{Enter}')
    expect(screen.getByText('inference')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove inference/i }))
    expect(screen.queryByText('inference')).toBeNull()
  })

  // Bug #11 — the sync reconcile re-applies keywords into the store every cycle (a NEW array
  // reference with IDENTICAL content). The keyword-change effect must compare VALUES, not the
  // reference, so a same-content re-set never wipes the just-streamed polish result.
  it('a same-content keywords re-set (sync reconcile) does NOT reset a done polish result (bug #11)', async () => {
    mockCreate.mockReturnValue(smartProvider())
    usePolishKeywordsStore.getState().addKeyword('inference') // a populated set, as a real reconcile would have
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'the draft')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Polish' }))
      await tick()
    })
    expect(useOperationStore.getState().polish.status).toBe('done')
    await act(async () => {
      // the sync reconcile re-applies keywords: a NEW array of identical entities (new references, same values)
      const same = usePolishKeywordsStore.getState().keywords.map((k) => ({ ...k }))
      usePolishKeywordsStore.setState({ keywords: same })
    })
    expect(useOperationStore.getState().polish.status).toBe('done') // must NOT have reset
  })

  it('a real keyword change still invalidates a done polish result', async () => {
    mockCreate.mockReturnValue(smartProvider())
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'the draft')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Polish' }))
      await tick()
    })
    expect(useOperationStore.getState().polish.status).toBe('done')
    await act(async () => {
      usePolishKeywordsStore.getState().addKeyword('inference') // real content change
    })
    expect(useOperationStore.getState().polish.status).toBe('idle') // invalidated for re-polish
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
    // The done result renders as word-lookup tokens (feature #20) — assert a distinctive word.
    expect(screen.getByRole('button', { name: 'result' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeInTheDocument()

    // Start "Translate original" — the stale polish result + its Accept must clear.
    await user.type(screen.getByRole('textbox', { name: 'Original' }), '原文')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /translate original/i }))
      await tick()
    })
    expect(screen.queryByRole('button', { name: 'result' })).toBeNull()
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
    expect(screen.getByRole('button', { name: 'result' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'add keyword' }), 'inference{Enter}')
    expect(useOperationStore.getState().polish.status).toBe('idle')
    expect(screen.queryByRole('button', { name: 'result' })).toBeNull()
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
    expect(screen.getByRole('button', { name: 'result' })).toBeInTheDocument()

    // Compare toggle works
    await user.click(screen.getByRole('button', { name: /compare/i }))
    expect(screen.getByRole('button', { name: /compare/i })).toHaveAttribute('aria-pressed', 'true')

    // Accept commits the polished result to the draft + confirmation toast
    await user.click(screen.getByRole('button', { name: /^accept$/i }))
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('polished result')
    expect(mockNotify).toHaveBeenCalledTimes(1)
    // feature #14: the completed polish run was auto-recorded (on done, not Accept); exactly one task.
    const sessions = useSessionStore.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tasks).toHaveLength(1)
    expect(sessions[0].tasks[0]).toMatchObject({ kind: 'polish', resultText: 'polished result' })
  })

  it('records the "keywords kept" onto the polished task (feature #25)', async () => {
    mockCreate.mockReturnValue(smartProvider())
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'add keyword' }), 'inference{Enter}')
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'rough draft text')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^polish$/i }))
      await tick()
    })
    expect(useSessionStore.getState().sessions[0].tasks[0]).toMatchObject({ kind: 'polish', keywords: ['inference'] })
  })

  it('auto-saves the CLEANED full polish result, not the model prose (feature #14 + #96)', async () => {
    const prose = 'Here is the improved sentence:\n\n"polished result"\n\nChanges made:\n- tidied it up'
    const proseStream = () =>
      (async function* (): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
        yield { text: prose }
        return { status: 'done', text: prose }
      })()
    const provider: LLMProvider = {
      vendor: 'anthropic',
      model: 'm',
      stream: proseStream,
      streamOp: proseStream,
      translate: async () => ({ status: 'done', text: '' }),
      polish: async () => ({ status: 'done', text: '' }),
    }
    mockCreate.mockReturnValue(provider)
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'rough draft')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^polish$/i }))
      await tick()
    })
    // No Accept — the completed run is auto-saved with the CLEANED result (no preamble / changes list).
    const tasks = useSessionStore.getState().sessions.flatMap((s) => s.tasks)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].resultText).toBe('polished result')
  })
})

// WI-1 (feature #23): the Clear button on the polish Original pane — a dedicated NON-ARMING handler
// that wipes the Original + resets the dependent polish/draftTranslate ops, and (M1) must NOT schedule
// an auto-polish even when auto-run is armed (parity with the translate source clear(), which never arms).
describe('PolishPanel — Clear (feature #23)', () => {
  it('wipes the Original and resets the dependent polish + draftTranslate ops', async () => {
    mockCreate.mockReturnValue(smartProvider())
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Original' }), '原文')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /translate original/i }))
      await tick()
    })
    // The draftTranslate op completed (mirrored into the draft) — a non-idle op to prove the reset.
    expect(useOperationStore.getState().draftTranslate.status).toBe('done')
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('translated draft')

    await user.click(clearButtonsIn('Original')[0])

    expect(screen.getByRole('textbox', { name: 'Original' })).toHaveValue('')
    expect(useOperationStore.getState().draftTranslate.status).toBe('idle')
    expect(useOperationStore.getState().polish.status).toBe('idle')
  })

  it('does NOT arm an auto-polish on Clear even when auto-run is armed (M1 guard)', async () => {
    vi.useFakeTimers()
    try {
      act(() => useProviderStore.getState().setVendor('ollama'))
      useAutoRunStore.getState().setEnabled('polish', true)
      mockCreate.mockReturnValue(smartProvider())
      render(<PolishPanel />)
      // A non-empty draft makes the polish request schedulable; editing the Original then arms a pending
      // auto-polish (it would re-polish the existing draft) — exactly what Clear must NOT do.
      fireEvent.change(screen.getByRole('textbox', { name: 'Draft to polish' }), { target: { value: 'rough draft' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Original' }), { target: { value: '原文' } })
      expect(screen.getByText(/auto-run in 1\.5s/i)).toBeInTheDocument()

      fireEvent.click(clearButtonsIn('Original')[0])
      // Clear cancels the pending auto-run and never re-arms — the chip dismisses immediately.
      expect(screen.queryByText(/auto-run in 1\.5s/i)).toBeNull()

      await act(async () => {
        vi.advanceTimersByTime(1500)
        await Promise.resolve()
      })
      // No auto-polish fired; the Original is wiped.
      expect(useOperationStore.getState().polish.status).toBe('idle')
      expect(screen.getByRole('textbox', { name: 'Original' })).toHaveValue('')
    } finally {
      vi.useRealTimers()
    }
  })
})

// WI-1 (feature #27): the Clear button on the polish DRAFT pane — a dedicated NON-ARMING handler
// (clearDraft) that wipes the draft + resets the dependent polish/draftTranslate ops, and must NOT
// schedule an auto-polish even under auto-run (parity with #23's clearOriginal). Its visibility guard
// is `!translating` (draftTranslate-streaming) only, so Clear stays live while the polish op streams.
describe('PolishPanel — Draft Clear (feature #27)', () => {
  it('DRAFT Clear empties the draft, resets the ops, and does NOT arm an auto-polish (auto-run on)', async () => {
    vi.useFakeTimers()
    try {
      act(() => useProviderStore.getState().setVendor('ollama'))
      useAutoRunStore.getState().setEnabled('polish', true)
      mockCreate.mockReturnValue(smartProvider())
      render(<PolishPanel />)
      // Typing a draft (with auto-run on) arms a pending auto-polish — exactly what Clear must NOT keep.
      fireEvent.change(screen.getByRole('textbox', { name: 'Draft to polish' }), { target: { value: 'rough draft' } })
      expect(screen.getByText(/auto-run in 1\.5s/i)).toBeInTheDocument()

      fireEvent.click(clearButtonsIn('Draft to polish')[0])
      // Draft wiped; the pending chip dismisses immediately (clearDraft cancels + never re-arms).
      expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('')
      expect(screen.queryByText(/auto-run in 1\.5s/i)).toBeNull()

      await act(async () => {
        vi.advanceTimersByTime(1500)
        await Promise.resolve()
      })
      // No provider run fired (createProvider is only reached inside a run), and both ops stay idle.
      expect(mockCreate).not.toHaveBeenCalled()
      expect(useOperationStore.getState().polish.status).toBe('idle')
      expect(useOperationStore.getState().draftTranslate.status).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays visible during a polish stream and resets the polish op when clicked', async () => {
    const { provider, release } = gatedPolishProvider()
    mockCreate.mockReturnValue(provider)
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'rough draft')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^polish$/i }))
      await tick()
    })
    // Polish is mid-stream (gated); draftTranslate is idle → `translating` is false → Clear is shown.
    expect(useOperationStore.getState().polish.status).toBe('streaming')
    expect(clearButtonsIn('Draft to polish').length).toBeGreaterThan(0)

    await act(async () => {
      await user.click(clearButtonsIn('Draft to polish')[0])
      await tick()
    })
    expect(useOperationStore.getState().polish.status).toBe('idle')
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('')

    await act(async () => {
      release()
      await tick()
    })
  })

  it('disarms/closes a draft (polishDraft) lookup that was armed when Clear is clicked', async () => {
    mockCreate.mockReturnValue(smartProvider())
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'hello world')
    act(() => {
      useLookupStore.setState({ open: true, owner: 'polishDraft', word: 'world' })
    })
    expect(useLookupStore.getState().open).toBe(true)

    await user.click(clearButtonsIn('Draft to polish')[0])
    // Empty draft → the usePaneLookup value-change effect closes the polishDraft lookup.
    expect(screen.getByRole('textbox', { name: 'Draft to polish' })).toHaveValue('')
    expect(useLookupStore.getState().open).toBe(false)
  })
})

// WI-2 (feature #11): auto-run toggle / "Run now" / pending / AUTO tag / draftTranslate-mirror guard.
describe('PolishPanel — auto-run', () => {
  it('switches the primary button to "Run now" once auto-run is on (local, no cost gate)', async () => {
    act(() => useProviderStore.getState().setVendor('ollama'))
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.click(screen.getByRole('switch'))
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /run now/i })).toBeInTheDocument()
  })

  it('debounced draft edits fire an auto polish that carries the AUTO tag', async () => {
    vi.useFakeTimers()
    try {
      act(() => useProviderStore.getState().setVendor('ollama'))
      useAutoRunStore.getState().setEnabled('polish', true)
      mockCreate.mockReturnValue(smartProvider())
      render(<PolishPanel />)
      fireEvent.change(screen.getByRole('textbox', { name: 'Draft to polish' }), {
        target: { value: 'rough draft' },
      })
      expect(screen.getByText(/auto-run in 1\.5s/i)).toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersByTime(1500)
        await Promise.resolve()
      })
      expect(useOperationStore.getState().polish.isAuto).toBe(true)
      expect(screen.getByRole('status', { name: /auto-run triggered/i })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does NOT arm auto-polish from the draftTranslate mirror writing the draft (M1 guard)', async () => {
    vi.useFakeTimers()
    try {
      act(() => useProviderStore.getState().setVendor('ollama'))
      useAutoRunStore.getState().setEnabled('polish', true)
      const { provider } = gatedTranslateProvider()
      mockCreate.mockReturnValue(provider)
      render(<PolishPanel />)
      fireEvent.change(screen.getByRole('textbox', { name: 'Original' }), { target: { value: '原文' } })
      // start "Translate original" — its stream mirrors into the draft while streaming
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /translate original/i }))
        await Promise.resolve()
      })
      // the draft was machine-written by the mirror; no auto-polish pending must be armed by it
      expect(screen.queryByText(/auto-run in 1\.5s/i)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

// WI-1 (feature #18): the polish-goal selector — chips feed the polish request; a goal change resets a
// stale result and (auto-run) arms a run carrying the NEW goal.
function capturingProvider(sink: { req?: LLMRequest }): LLMProvider {
  async function* streamOp(req: LLMRequest): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    if (req.kind === 'polish') sink.req = req
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
const goalOf = (r?: LLMRequest) => (r && r.kind === 'polish' ? r.goal : undefined)

describe('PolishPanel — goal selector (feature #18)', () => {
  it('defaults to clarity and polishes with the selected goal', async () => {
    const sink: { req?: LLMRequest } = {}
    mockCreate.mockReturnValue(capturingProvider(sink))
    const user = userEvent.setup()
    render(<PolishPanel />)
    expect(screen.getByRole('radio', { name: 'Clarity' })).toBeChecked()
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'hello')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Polish' }))
      await tick()
    })
    expect(goalOf(sink.req)).toBe('clarity')
    await user.click(screen.getByRole('radio', { name: 'Grammar' }))
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Polish' }))
      await tick()
    })
    expect(goalOf(sink.req)).toBe('grammar')
  })

  it('changing the goal clears a showing polish result (stale-result reset)', async () => {
    mockCreate.mockReturnValue(smartProvider())
    const user = userEvent.setup()
    render(<PolishPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Draft to polish' }), 'hello')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Polish' }))
      await tick()
    })
    expect(screen.getByRole('button', { name: 'result' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Tone' }))
    expect(screen.queryByRole('button', { name: 'result' })).toBeNull()
  })

  it('with auto-run on, changing the goal arms a run carrying the NEW goal', async () => {
    vi.useFakeTimers()
    try {
      act(() => useProviderStore.getState().setVendor('ollama'))
      useAutoRunStore.getState().setEnabled('polish', true)
      const sink: { req?: LLMRequest } = {}
      mockCreate.mockReturnValue(capturingProvider(sink))
      render(<PolishPanel />)
      fireEvent.change(screen.getByRole('textbox', { name: 'Draft to polish' }), { target: { value: 'rough draft' } })
      fireEvent.click(screen.getByRole('radio', { name: 'Grammar' }))
      await act(async () => {
        vi.advanceTimersByTime(1500)
        await Promise.resolve()
      })
      expect(goalOf(sink.req)).toBe('grammar')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not arm a run on a goal change with an empty draft', async () => {
    vi.useFakeTimers()
    try {
      act(() => useProviderStore.getState().setVendor('ollama'))
      useAutoRunStore.getState().setEnabled('polish', true)
      mockCreate.mockReturnValue(smartProvider())
      render(<PolishPanel />)
      fireEvent.click(screen.getByRole('radio', { name: 'Grammar' }))
      expect(screen.queryByText(/auto-run in 1\.5s/i)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

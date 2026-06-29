import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/providers', () => ({ createProvider: vi.fn() }))
vi.mock('@/components/workspace/notify', () => ({ notify: vi.fn() }))
import { createProvider } from '@/providers'
import { notify } from '@/components/workspace/notify'
import '@/i18n'
import { TranslatePanel } from './TranslatePanel'
import { LOAD_SOURCE_EVENT, loadSourceIntoWorkspace } from '@/lib/workspace/loadSource'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
import { useAutoRunStore } from '@/stores/autoRunStore'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'
import { __resetAutoRecord } from '@/lib/sessions/autoRecord'
import type { LLMProvider, LLMRequest, ProviderOutcome, StreamChunk } from '@/providers/types'

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
  __resetSessionIds()
  useSessionStore.getState().reset()
  __resetAutoRecord() // feature #14 — clear the per-panel auto-record dedup map between tests
  useAutoRunStore.getState().reset()
  useOperationStore.getState().reset('translate')
  useOperationStore.setState({ translate: { status: 'idle', startedAt: null, elapsedMs: null, runId: 0, isAuto: false } })
})

describe('TranslatePanel', () => {
  it('detects the direction live from the source text', async () => {
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText('Source'), '你好')
    expect(screen.getByText('中文')).toBeInTheDocument()
    expect(screen.getByText('English')).toBeInTheDocument()
  })

  // WI-3 / #13 — the editor cap is tier-scoped: 50vh on phone (<600), 88vh on tablet/desktop, so one
  // editor can't swallow the single-column phone layout. The two-column editor row stacks below 600.
  it('caps the source editor height per tier (50vh phone / 88vh ≥600)', () => {
    render(<TranslatePanel />)
    const source = screen.getByLabelText('Source')
    expect(source.className).toContain('max-[599px]:max-h-[50vh]')
    expect(source.className).toContain('min-[600px]:max-h-[88vh]')
    // Never the unconditional 88vh cap that #13 flagged as too tall for a 760px phone.
    expect(source.className.split(/\s+/)).not.toContain('max-h-[88vh]')
  })

  it('stacks the source/translation columns below 600', () => {
    const { container } = render(<TranslatePanel />)
    const row = screen.getByLabelText('Source').closest('.flex.items-start')!
    expect(row.className).toContain('max-[599px]:flex-col')
    expect(container).toBeTruthy()
  })

  it('streams a translation on Run (mocked provider) and shows Copy/Accept when done', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(okProvider('Hola mundo'))
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText('Source'), 'Hello world')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^translate$/i }))
      await tick()
    })
    // The done result renders as word-lookup tokens (feature #20) — assert a distinctive word.
    expect(screen.getByRole('button', { name: 'mundo' })).toBeInTheDocument()
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
    await user.type(screen.getByLabelText('Source'), 'Hello world')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^translate$/i }))
      await tick()
    })
    await user.click(screen.getByRole('button', { name: /^accept$/i }))
    // committed → button flips to the accepted label, and the confirmation toast fired
    expect(screen.getByRole('button', { name: 'Accepted ✓' })).toBeInTheDocument()
    expect(mockNotify).toHaveBeenCalledTimes(1)
    // feature #14: the completed run was auto-recorded (on done, not on Accept); Accept commits to the
    // editor and does NOT additionally record — exactly one task.
    const sessions = useSessionStore.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tasks).toHaveLength(1)
    expect(sessions[0].tasks[0]).toMatchObject({ kind: 'translate', sourceText: 'Hello world', resultText: 'Hola mundo' })
  })

  it('auto-records a completed run to history WITHOUT requiring Accept (feature #14)', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    mockCreate.mockReturnValue(okProvider('Hola mundo'))
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText('Source'), 'Hello world')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^translate$/i }))
      await tick()
    })
    // No Accept click — the completed run is already in history.
    const sessions = useSessionStore.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tasks).toHaveLength(1)
    expect(sessions[0].tasks[0]).toMatchObject({ kind: 'translate', resultText: 'Hola mundo' })
  })

  // WI-4: the direction override changes the source editor's visual dir (never the request).
  it('forces the source editor direction via the override (default auto → rtl)', async () => {
    const user = userEvent.setup()
    render(<TranslatePanel />)
    const ta = screen.getByLabelText('Source')
    expect(ta).toHaveAttribute('dir', 'auto')
    await user.click(screen.getByRole('button', { name: /override source direction/i }))
    await user.click(screen.getByRole('menuitem', { name: /force rtl/i }))
    expect(ta).toHaveAttribute('dir', 'rtl')
    expect(ta).toHaveStyle({ unicodeBidi: 'isolate' })
  })

  it('the direction override is visual-only — it does NOT change the request languages', async () => {
    useProviderStore.getState().setApiKey('sk-test')
    let lastReq: LLMRequest | undefined
    async function* streamOp(req: LLMRequest): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
      lastReq = req
      yield { text: 'x' }
      return { status: 'done', text: 'x' }
    }
    mockCreate.mockReturnValue({
      vendor: 'anthropic',
      model: 'm',
      stream: (req) => streamOp(req),
      streamOp: (req) => streamOp(req),
      translate: async () => ({ status: 'done', text: 'x' }),
      polish: async () => ({ status: 'done', text: 'x' }),
    })
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText('Source'), 'Hello world')
    // force RTL layout — the detected en→zh route must be unchanged
    await user.click(screen.getByRole('button', { name: /override source direction/i }))
    await user.click(screen.getByRole('menuitem', { name: /force rtl/i }))
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^translate$/i }))
      await tick()
    })
    expect(lastReq).toMatchObject({ kind: 'translate', sourceLang: 'en', targetLang: 'zh' })
  })

  it('Clear empties the source textarea', async () => {
    const user = userEvent.setup()
    render(<TranslatePanel />)
    const ta = screen.getByLabelText('Source')
    await user.type(ta, 'text')
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(ta).toHaveValue('')
  })
})

// WI-2 (feature #11): the auto-run toggle, "Run now" label, pending ring, AUTO tag, ⌘↵ run-now.
describe('TranslatePanel — auto-run', () => {
  it('disables the toggle (with a reason) until a provider key is set, then enables it', () => {
    render(<TranslatePanel />)
    const sw = screen.getByRole('switch')
    expect(sw).toBeDisabled()
    expect(screen.getByText(/add a key for/i)).toBeInTheDocument()

    act(() => {
      useProviderStore.getState().setApiKey('sk-test')
    })
    expect(screen.getByRole('switch')).not.toBeDisabled()
  })

  it('switches the primary button to "Run now" once auto-run is on (local provider, no cost gate)', async () => {
    act(() => {
      useProviderStore.getState().setVendor('ollama') // local → no cost gate
    })
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.click(screen.getByRole('switch'))
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /run now/i })).toBeInTheDocument()
  })

  it('shows the hosted cost gate on first enable; accepting it enables auto-run', async () => {
    act(() => useProviderStore.getState().setApiKey('sk-test')) // anthropic, hosted
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.click(screen.getByRole('switch'))
    expect(screen.getByText(/auto-run uses a paid provider/i)).toBeInTheDocument()
    expect(useAutoRunStore.getState().enabled.translate).toBe(false) // not yet enabled
    await user.click(screen.getByRole('button', { name: /enable auto-run/i }))
    expect(useAutoRunStore.getState().enabled.translate).toBe(true)
    expect(useAutoRunStore.getState().costAck.anthropic).toBe(true)
  })

  it('debounced typing fires an auto run that carries the AUTO tag', async () => {
    vi.useFakeTimers()
    try {
      useProviderStore.getState().setVendor('ollama')
      useAutoRunStore.getState().setEnabled('translate', true)
      mockCreate.mockReturnValue(okProvider('Hola'))
      render(<TranslatePanel />)
      // fireEvent (synchronous) avoids userEvent's fake-timer coordination overhead.
      fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Hello' } })
      expect(screen.getByText(/auto-run in 1\.5s/i)).toBeInTheDocument() // pending ring shown
      await act(async () => {
        vi.advanceTimersByTime(1500)
        await Promise.resolve()
      })
      expect(useOperationStore.getState().translate.isAuto).toBe(true)
      expect(screen.getByRole('status', { name: /auto-run triggered/i })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a manual Run now while auto-run is on fires without the AUTO tag and clears the pending timer', async () => {
    vi.useFakeTimers()
    try {
      useProviderStore.getState().setVendor('ollama')
      useAutoRunStore.getState().setEnabled('translate', true)
      mockCreate.mockReturnValue(okProvider('Hola'))
      render(<TranslatePanel />)
      fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Hello' } })
      expect(screen.getByText(/auto-run in 1\.5s/i)).toBeInTheDocument()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /run now/i }))
        await Promise.resolve()
      })
      expect(useOperationStore.getState().translate.isAuto).toBe(false)
      expect(screen.queryByText(/auto-run in 1\.5s/i)).toBeNull() // pending cleared
      expect(screen.queryByRole('status', { name: /auto-run triggered/i })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

// WI-1 (feature #24) — the "Open in workspace" load: a LOAD_SOURCE_EVENT routes the starred source
// through onSourceChange (reset + auto-run re-arm) via a ref so the FRESH armed state is read.
describe('TranslatePanel — load source (feature #24)', () => {
  it('replaces the source AND resets the prior (done) result on a load request', async () => {
    useProviderStore.getState().setApiKey('sk-test') // anthropic, auto off by default
    mockCreate.mockReturnValue(okProvider('Hola mundo'))
    const user = userEvent.setup()
    render(<TranslatePanel />)
    await user.type(screen.getByLabelText('Source'), 'Hello world')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^translate$/i }))
      await tick()
    })
    expect(useOperationStore.getState().translate.status).toBe('done')
    expect(screen.getByRole('button', { name: 'mundo' })).toBeInTheDocument()

    // Load a starred source — the editor takes the new text and the stale result is cleared.
    act(() => loadSourceIntoWorkspace('Bonjour le monde'))
    expect(screen.getByLabelText('Source')).toHaveValue('Bonjour le monde')
    expect(useOperationStore.getState().translate.status).toBe('idle') // reset, not 'done'
    expect(screen.queryByRole('button', { name: 'mundo' })).toBeNull() // stale result gone
  })

  it('SCHEDULES an auto-run when auto is armed AFTER mount (ref reads the fresh armed state)', async () => {
    vi.useFakeTimers()
    try {
      useProviderStore.getState().setVendor('ollama') // local → no cost gate
      render(<TranslatePanel />)
      // Arm auto-run AFTER mount — the mount-time listener must read THIS state, not a stale closure.
      act(() => fireEvent.click(screen.getByRole('switch')))
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
      act(() => loadSourceIntoWorkspace('Hello'))
      expect(screen.getByText(/auto-run in 1\.5s/i)).toBeInTheDocument() // scheduled
    } finally {
      vi.useRealTimers()
    }
  })

  it('does NOT schedule when auto is disarmed AFTER mount (no stale auto-translate)', async () => {
    vi.useFakeTimers()
    try {
      useProviderStore.getState().setVendor('ollama')
      useAutoRunStore.getState().setEnabled('translate', true) // start armed
      mockCreate.mockReturnValue(okProvider('Hola'))
      render(<TranslatePanel />)
      // Disarm AFTER mount.
      act(() => fireEvent.click(screen.getByRole('switch')))
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
      act(() => loadSourceIntoWorkspace('Hello'))
      expect(screen.queryByText(/auto-run in 1\.5s/i)).toBeNull() // nothing scheduled
      await act(async () => {
        vi.advanceTimersByTime(2000)
        await Promise.resolve()
      })
      expect(useOperationStore.getState().translate.status).toBe('idle') // no run fired
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes its load-source listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<TranslatePanel />)
    unmount()
    expect(removeSpy).toHaveBeenCalledWith(LOAD_SOURCE_EVENT, expect.any(Function))
    removeSpy.mockRestore()
  })
})

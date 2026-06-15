import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useOperationStore, setOperationClock } from './operationStore'
import type { LLMProvider, LLMRequest, ProviderOutcome, StreamChunk } from '@/providers/types'
import { makeProviderError } from '@/providers/errors'

const req: LLMRequest = { kind: 'translate', text: 'Hi', targetLang: 'es' }
const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const idle = () => ({ status: 'idle' as const, startedAt: null, elapsedMs: null, runId: 0 })
const clockSeq = (...vals: number[]) => {
  let i = 0
  return () => vals[Math.min(i++, vals.length - 1)]
}

/** A provider whose streamOp yields the given chunks then returns the outcome. */
function simpleProvider(chunks: string[], outcome: ProviderOutcome): LLMProvider {
  async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    for (const t of chunks) yield { text: t }
    return outcome
  }
  return {
    vendor: 'anthropic',
    model: 'm',
    stream: () => streamOp(),
    streamOp: () => streamOp(),
    translate: async () => outcome,
    polish: async () => outcome,
  }
}

/** A provider whose stream pauses after the first chunk until release() is called. */
function gatedProvider(outcome: ProviderOutcome = { status: 'done', text: 'ab' }) {
  let release: (() => void) | null = null
  async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    yield { text: 'a' }
    await new Promise<void>((r) => {
      release = r
    })
    yield { text: 'b' }
    return outcome
  }
  const provider: LLMProvider = {
    vendor: 'anthropic',
    model: 'm',
    stream: () => streamOp(),
    streamOp: () => streamOp(),
    translate: async () => outcome,
    polish: async () => outcome,
  }
  return {
    provider,
    release: () => {
      release?.()
      release = null
    },
  }
}

/** A provider whose stream pauses BEFORE returning (no second chunk) until release(). */
function gatedThenReturn(outcome: ProviderOutcome) {
  let release: (() => void) | null = null
  async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    yield { text: 'a' }
    await new Promise<void>((r) => {
      release = r
    })
    return outcome
  }
  const provider: LLMProvider = {
    vendor: 'anthropic',
    model: 'm',
    stream: () => streamOp(),
    streamOp: () => streamOp(),
    translate: async () => outcome,
    polish: async () => outcome,
  }
  return {
    provider,
    release: () => {
      release?.()
      release = null
    },
  }
}

beforeEach(() => {
  const s = useOperationStore.getState()
  s.reset('translate')
  s.reset('polish')
  s.reset('draftTranslate')
  useOperationStore.setState({ translate: idle(), polish: idle(), draftTranslate: idle() })
  setOperationClock(() => 1000)
})

describe('operationStore — run lifecycle', () => {
  it('accumulates chunks then sets done with frozen elapsedMs', async () => {
    setOperationClock(clockSeq(1000, 1500))
    await useOperationStore.getState().run('translate', req, simpleProvider(['Ho', 'la'], { status: 'done', text: 'Hola' }))
    expect(useOperationStore.getState().translate).toEqual({
      status: 'done',
      text: 'Hola',
      startedAt: 1000,
      elapsedMs: 500,
      runId: 1,
    })
  })

  it('sets error keeping the partial text from the normalized outcome', async () => {
    const outcome: ProviderOutcome = { status: 'error', text: 'par', error: makeProviderError('providerDown') }
    await useOperationStore.getState().run('polish', req, simpleProvider(['par'], outcome))
    const op = useOperationStore.getState().polish
    expect(op.status).toBe('error')
    if (op.status === 'error') {
      expect(op.text).toBe('par')
      expect(op.error.kind).toBe('providerDown')
    }
  })

  it('sets cancelled from a cancelled outcome', async () => {
    await useOperationStore.getState().run('translate', req, simpleProvider([], { status: 'cancelled', text: '' }))
    expect(useOperationStore.getState().translate.status).toBe('cancelled')
  })
})

describe('operationStore — abort / reset / fail (synchronous transitions)', () => {
  it('abort() synchronously cancels a streaming panel, keeping partial text + frozen elapsed', async () => {
    setOperationClock(clockSeq(1000, 1500))
    const { provider, release } = gatedProvider()
    const p = useOperationStore.getState().run('translate', req, provider)
    await tick()
    expect(useOperationStore.getState().translate.status).toBe('streaming')

    useOperationStore.getState().abort('translate')
    expect(useOperationStore.getState().translate).toEqual({
      status: 'cancelled',
      text: 'a',
      startedAt: 1000,
      elapsedMs: 500,
      runId: 2,
    })

    release()
    await p
    expect(useOperationStore.getState().translate.status).toBe('cancelled') // not overwritten by the late chunk/finish
  })

  it('abort() on an idle panel yields cancelled with empty text + null elapsed', () => {
    useOperationStore.getState().abort('translate')
    expect(useOperationStore.getState().translate).toMatchObject({ status: 'cancelled', text: '', elapsedMs: null })
  })

  it('reset() returns the panel to idle and bumps runId; reset on idle is safe', async () => {
    await useOperationStore.getState().run('polish', req, simpleProvider(['x'], { status: 'done', text: 'x' }))
    const before = useOperationStore.getState().polish.runId
    useOperationStore.getState().reset('polish')
    expect(useOperationStore.getState().polish).toEqual({ status: 'idle', startedAt: null, elapsedMs: null, runId: before + 1 })
    useOperationStore.getState().reset('polish') // idle → idle, no controller
    expect(useOperationStore.getState().polish.status).toBe('idle')
  })

  it('fail() sets a mapped error without a stream', () => {
    useOperationStore.getState().fail('draftTranslate', makeProviderError('invalidKey'))
    const op = useOperationStore.getState().draftTranslate
    expect(op.status).toBe('error')
    if (op.status === 'error') expect(op.error.kind).toBe('invalidKey')
  })
})

describe('operationStore — concurrency', () => {
  it('re-entrancy: running a streaming panel aborts it and does NOT start a second stream', async () => {
    const { provider } = gatedProvider()
    void useOperationStore.getState().run('translate', req, provider)
    await tick()
    expect(useOperationStore.getState().translate.status).toBe('streaming')

    const second = simpleProvider(['z'], { status: 'done', text: 'z' })
    const spy = vi.spyOn(second, 'streamOp')
    await useOperationStore.getState().run('translate', req, second)
    expect(spy).not.toHaveBeenCalled()
    expect(useOperationStore.getState().translate.status).toBe('cancelled')
  })

  it('three panels run independently; aborting one leaves the others streaming', async () => {
    const t = gatedProvider()
    const pol = gatedProvider()
    void useOperationStore.getState().run('translate', req, t.provider)
    void useOperationStore.getState().run('polish', req, pol.provider)
    await tick()
    expect(useOperationStore.getState().translate.status).toBe('streaming')
    expect(useOperationStore.getState().polish.status).toBe('streaming')

    useOperationStore.getState().abort('translate')
    expect(useOperationStore.getState().translate.status).toBe('cancelled')
    expect(useOperationStore.getState().polish.status).toBe('streaming') // untouched

    t.release()
    pol.release()
  })

  it('a chunk/finish arriving after reset() does not mutate the panel (runId guard)', async () => {
    const { provider, release } = gatedProvider()
    const p = useOperationStore.getState().run('translate', req, provider)
    await tick()
    const streaming = useOperationStore.getState().translate
    expect(streaming.status).toBe('streaming')
    if (streaming.status === 'streaming') expect(streaming.text).toBe('a')

    useOperationStore.getState().reset('translate') // supersedes the in-flight run
    release()
    await p
    expect(useOperationStore.getState().translate.status).toBe('idle') // late chunk + finish were no-ops
  })

  it('a stream that FINISHES after reset() does not write its outcome (post-loop runId guard)', async () => {
    const { provider, release } = gatedThenReturn({ status: 'done', text: 'a' })
    const p = useOperationStore.getState().run('translate', req, provider)
    await tick() // 'a' processed; the run is paused awaiting the gated return
    useOperationStore.getState().reset('translate') // supersede before completion
    release() // the stream now returns 'done' — but the run is stale
    await p
    expect(useOperationStore.getState().translate.status).toBe('idle') // outcome not written
  })
})

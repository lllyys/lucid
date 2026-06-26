import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLookupStore } from './lookupStore'
import type { LLMProvider, ProviderOutcome, StreamChunk } from '@/providers/types'
import { makeProviderError } from '@/providers/errors'

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

const PAYLOAD = { word: 'stutter', sentence: 'the user will perceive stutter', sourceLang: 'en', targetLang: 'zh' }

const FULL = JSON.stringify({
  word: 'stutter',
  ipa: '/synthetic/',
  partOfSpeech: 'noun',
  translations: ['t1', 't2'],
  meaning: 'an in-context meaning',
  senses: [{ gloss: 'g1', meaning: 'm1' }],
})

function provider(chunks: string[], outcome: ProviderOutcome): LLMProvider {
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
function gatedProvider(first: string, rest: string, outcome: ProviderOutcome) {
  let release: (() => void) | null = null
  async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    yield { text: first }
    await new Promise<void>((r) => {
      release = r
    })
    yield { text: rest }
    return outcome
  }
  const p: LLMProvider = {
    vendor: 'anthropic',
    model: 'm',
    stream: () => streamOp(),
    streamOp: () => streamOp(),
    translate: async () => outcome,
    polish: async () => outcome,
  }
  return { provider: p, release: () => { release?.(); release = null } }
}

/** A provider whose stream pauses BEFORE the terminal return until release() is called. */
function gatedThenReturn(first: string, outcome: ProviderOutcome) {
  let release: (() => void) | null = null
  async function* streamOp(): AsyncGenerator<StreamChunk, ProviderOutcome, void> {
    yield { text: first }
    await new Promise<void>((r) => {
      release = r
    })
    return outcome
  }
  const p: LLMProvider = {
    vendor: 'anthropic',
    model: 'm',
    stream: () => streamOp(),
    streamOp: () => streamOp(),
    translate: async () => outcome,
    polish: async () => outcome,
  }
  return { provider: p, release: () => { release?.(); release = null } }
}

beforeEach(() => {
  useLookupStore.getState().close()
})

describe('lookupStore', () => {
  it('starts idle / closed', () => {
    const s = useLookupStore.getState()
    expect(s.status).toBe('idle')
    expect(s.open).toBe(false)
  })

  it('opens on lookup() and captures the activation payload', async () => {
    await useLookupStore.getState().lookup(PAYLOAD, provider([FULL], { status: 'done', text: FULL }))
    const s = useLookupStore.getState()
    expect(s.open).toBe(true)
    expect(s.word).toBe('stutter')
    expect(s.sentence).toBe(PAYLOAD.sentence)
    expect(s.targetLang).toBe('zh')
    expect(s.sourceLang).toBe('en')
  })

  it('transitions idle → streaming → done, filling parsed fields', async () => {
    const { provider: p, release } = gatedProvider('{"word":"stutter","ipa":"/x/"', ',"meaning":"m"}', {
      status: 'done',
      text: '{"word":"stutter","ipa":"/x/","meaning":"m"}',
    })
    const run = useLookupStore.getState().lookup(PAYLOAD, p)
    await tick()
    expect(useLookupStore.getState().status).toBe('streaming')
    // early fields are visible mid-stream
    expect(useLookupStore.getState().word).toBe('stutter')
    expect(useLookupStore.getState().ipa).toBe('/x/')
    release()
    await run
    expect(useLookupStore.getState().status).toBe('done')
    expect(useLookupStore.getState().meaning).toBe('m')
  })

  it('done + complete JSON populates translations + senses', async () => {
    await useLookupStore.getState().lookup(PAYLOAD, provider([FULL], { status: 'done', text: FULL }))
    const s = useLookupStore.getState()
    expect(s.status).toBe('done')
    expect(s.translations).toEqual(['t1', 't2'])
    expect(s.senses).toEqual([{ gloss: 'g1', meaning: 'm1' }])
  })

  it('done but UNPARSEABLE final → error (lookup.noDefinition mapping)', async () => {
    await useLookupStore.getState().lookup(PAYLOAD, provider(['not json'], { status: 'done', text: 'not json' }))
    const s = useLookupStore.getState()
    expect(s.status).toBe('error')
    expect(s.error?.kind).toBe('refusal')
  })

  it('done but EMPTY string → error', async () => {
    await useLookupStore.getState().lookup(PAYLOAD, provider([''], { status: 'done', text: '' }))
    expect(useLookupStore.getState().status).toBe('error')
  })

  it('a provider error outcome → error state (verbatim)', async () => {
    const err = makeProviderError('rateLimited')
    await useLookupStore.getState().lookup(PAYLOAD, provider([], { status: 'error', text: '', error: err }))
    const s = useLookupStore.getState()
    expect(s.status).toBe('error')
    expect(s.error?.kind).toBe('rateLimited')
  })

  it('a cancelled outcome leaves a non-error closed-ish state (no error surfaced)', async () => {
    await useLookupStore.getState().lookup(PAYLOAD, provider([], { status: 'cancelled', text: '' }))
    expect(useLookupStore.getState().status).not.toBe('error')
  })

  it('close() resets to idle + closed and bumps runId', async () => {
    await useLookupStore.getState().lookup(PAYLOAD, provider([FULL], { status: 'done', text: FULL }))
    const before = useLookupStore.getState().runId
    useLookupStore.getState().close()
    const s = useLookupStore.getState()
    expect(s.open).toBe(false)
    expect(s.status).toBe('idle')
    expect(s.runId).toBe(before + 1)
  })

  it('runId stale-guard — a superseded lookup never writes after a newer one starts', async () => {
    const A = gatedProvider('{"word":"A"', ',"meaning":"oldA"}', { status: 'done', text: '{"word":"A","meaning":"oldA"}' })
    const runA = useLookupStore.getState().lookup({ ...PAYLOAD, word: 'A' }, A.provider)
    await tick()
    expect(useLookupStore.getState().word).toBe('A')
    // start B (a new word) BEFORE A releases
    const runB = useLookupStore.getState().lookup(
      { ...PAYLOAD, word: 'B' },
      provider(['{"word":"B","meaning":"newB"}'], { status: 'done', text: '{"word":"B","meaning":"newB"}' }),
    )
    await runB
    expect(useLookupStore.getState().word).toBe('B')
    // now let A finish — its late write must NOT clobber B
    A.release()
    await runA
    expect(useLookupStore.getState().word).toBe('B')
    expect(useLookupStore.getState().meaning).toBe('newB')
  })

  it('runId stale-guard at the TERMINAL — a superseded run does not write its done outcome', async () => {
    const A = gatedThenReturn('{"word":"A","meaning":"oldA"}', {
      status: 'done',
      text: '{"word":"A","meaning":"oldA"}',
    })
    const runA = useLookupStore.getState().lookup({ ...PAYLOAD, word: 'A' }, A.provider)
    await tick()
    // close() bumps runId → A becomes stale; releasing A must not write its terminal outcome
    useLookupStore.getState().close()
    A.release()
    await runA
    expect(useLookupStore.getState().open).toBe(false)
    expect(useLookupStore.getState().status).toBe('idle')
  })

  it('done with a meaning but no word falls back to the clicked word', async () => {
    const text = JSON.stringify({ meaning: 'just a meaning' })
    await useLookupStore.getState().lookup(PAYLOAD, provider([text], { status: 'done', text }))
    const s = useLookupStore.getState()
    expect(s.status).toBe('done')
    expect(s.word).toBe(PAYLOAD.word) // ?? payload.word fallback
    expect(s.meaning).toBe('just a meaning')
  })

  it('done with a word but no meaning yields an empty meaning (still usable)', async () => {
    const text = JSON.stringify({ word: 'lone' })
    await useLookupStore.getState().lookup(PAYLOAD, provider([text], { status: 'done', text }))
    const s = useLookupStore.getState()
    expect(s.status).toBe('done')
    expect(s.word).toBe('lone')
    expect(s.meaning).toBe('')
  })

  it('a new lookup aborts the prior in-flight controller before starting', async () => {
    const A = gatedProvider('{"word":"A"', '}', { status: 'done', text: '{"word":"A"}' })
    const spyA = vi.spyOn(A.provider, 'streamOp')
    const runA = useLookupStore.getState().lookup({ ...PAYLOAD, word: 'A' }, A.provider)
    await tick()
    const runB = useLookupStore.getState().lookup(
      { ...PAYLOAD, word: 'B' },
      provider(['{"word":"B","meaning":"m"}'], { status: 'done', text: '{"word":"B","meaning":"m"}' }),
    )
    await runB
    // A's stream began; B superseded it (runId guard). A's signal was aborted.
    expect(spyA).toHaveBeenCalled()
    const passedSignal = spyA.mock.calls[0][1]?.signal
    expect(passedSignal?.aborted).toBe(true)
    A.release()
    await runA
  })
})

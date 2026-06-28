// Purpose: the single active word-lookup's state (feature #20). Unlike operationStore (which
// models per-PanelId streamed TEXT), a lookup carries STRUCTURED dictionary fields and there is
// only ONE active entry — a separate store keeps the panel union uncorrupted. It owns the
// lookup run loop: one AbortController + a monotonic runId, aborting the prior controller BEFORE
// incrementing runId / starting the new stream, and guarding every post-await write with the
// captured runId (mirrors operationStore). It consumes provider.streamOp, accumulates the text,
// and re-parses via parseDefine on each chunk + at the terminal. A `done` outcome whose final
// parse yields no usable word/meaning maps to an error (rule 65) — streamOp returns `done` for
// any completed stream, so this explicit mapping is required. Each lookup carries an `owner`
// (the host that started it) so that — with several lookup hosts mounted at once (feature #169)
// — only the owning host renders the surface; gating keys on `open && owner === hostId`.

import { create } from 'zustand'
import type { DefineRequest, LLMProvider, ProviderError, StreamOptions } from '@/providers/types'
import { makeProviderError } from '@/providers/errors'
import { parseDefine, type DefineSense } from '@/lib/lookup/parseDefine'

export type LookupStatus = 'idle' | 'streaming' | 'done' | 'error'

/**
 * Which lookup HOST owns the active lookup. There is one global lookup at a time, but several
 * hosts are mounted concurrently (both result panes are always rendered; the editable-pane
 * overlays mount alongside — feature #169). Each host gates its surface on `open && owner === id`
 * so a lookup in one host never opens (or paints a chip in) another. One value per host (5).
 */
export type LookupOwner =
  | 'translateResult'
  | 'polishResult'
  | 'translateSource'
  | 'polishOriginal'
  | 'polishDraft'

/** What the host pane supplies at click time (the define request + display context). */
export interface LookupPayload {
  word: string
  sentence: string
  sourceLang?: string
  targetLang: string
  /** The host that initiated this lookup; stamped into the store so only it shows the surface. */
  owner: LookupOwner
}

interface LookupStore {
  // structured fields (filled from parseDefine)
  word: string
  ipa: string
  partOfSpeech: string
  translations: string[]
  meaning: string
  senses: DefineSense[]
  // lifecycle
  status: LookupStatus
  error?: ProviderError
  runId: number
  open: boolean
  /** The host that owns the active lookup (gated on `open && owner === id`). */
  owner: LookupOwner
  // activation context (for the header direction + context line)
  sentence: string
  sourceLang?: string
  targetLang?: string
  /** Start (or replace) the active lookup, driving provider.streamOp. */
  lookup(payload: LookupPayload, provider: LLMProvider): Promise<void>
  /** Dismiss the popover + reset state; bumps runId so any in-flight run goes stale. */
  close(): void
}

const FIELDS = {
  word: '',
  ipa: '',
  partOfSpeech: '',
  translations: [] as string[],
  meaning: '',
  senses: [] as DefineSense[],
}

// One AbortController for the single active lookup. Module-scope (not store/React state) so it is
// never serialized and aborting is decoupled from render.
let controller: AbortController | null = null
function dropController(): void {
  if (controller) {
    controller.abort()
    controller = null
  }
}

export const useLookupStore = create<LookupStore>((set, get) => ({
  ...FIELDS,
  status: 'idle',
  runId: 0,
  open: false,
  // Initial owner is irrelevant while `open === false` — gating keys on `open && owner === id`.
  // It is re-stamped on every lookup() and left as-is by close() (no host reads it while closed).
  owner: 'translateResult',
  sentence: '',

  close() {
    dropController()
    set({
      ...FIELDS,
      status: 'idle',
      error: undefined,
      open: false,
      sentence: '',
      sourceLang: undefined,
      targetLang: undefined,
      runId: get().runId + 1,
    })
  },

  async lookup(payload, provider) {
    // Abort the prior in-flight run BEFORE bumping runId / starting the new stream.
    dropController()
    const runId = get().runId + 1
    const ctrl = new AbortController()
    controller = ctrl
    set({
      ...FIELDS,
      word: payload.word, // show the clicked word immediately (segmentation already has it)
      status: 'streaming',
      error: undefined,
      open: true,
      owner: payload.owner, // stamp the host so only it shows the surface (#169)
      sentence: payload.sentence,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      runId,
    })

    const isStale = () => get().runId !== runId
    const request: DefineRequest = {
      kind: 'define',
      word: payload.word,
      sentence: payload.sentence,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
    }
    const options: StreamOptions = { signal: ctrl.signal }

    let text = ''
    const gen = provider.streamOp(request, options)
    let res = await gen.next()
    while (!res.done) {
      if (isStale()) return
      text += res.value.text
      const parsed = parseDefine(text)
      set({
        status: 'streaming',
        word: parsed.word ?? payload.word,
        ipa: parsed.ipa ?? '',
        partOfSpeech: parsed.partOfSpeech ?? '',
        translations: parsed.translations,
        meaning: parsed.meaning ?? '',
        senses: parsed.senses,
        runId,
      })
      res = await gen.next()
    }
    if (isStale()) return
    controller = null

    const outcome = res.value
    if (outcome.status === 'error') {
      set({ status: 'error', error: outcome.error, runId })
      return
    }
    if (outcome.status === 'cancelled') {
      // A user/abort cancellation is not an error — leave the popover in its closed-by-close path
      // (close() already ran or will). Keep status non-error; nothing to surface (rule 65 §3).
      set({ status: 'idle', runId })
      return
    }
    // outcome.status === 'done' — parse the final text. An unparseable / empty / field-less
    // result is a done-but-no-definition: map to error (H3).
    const parsed = parseDefine(outcome.text)
    if (!parsed.usable) {
      set({ status: 'error', error: makeProviderError('refusal', { detail: 'no definition' }), runId })
      return
    }
    set({
      status: 'done',
      word: parsed.word ?? payload.word,
      ipa: parsed.ipa ?? '',
      partOfSpeech: parsed.partOfSpeech ?? '',
      translations: parsed.translations,
      meaning: parsed.meaning ?? '',
      senses: parsed.senses,
      runId,
    })
  },
}))

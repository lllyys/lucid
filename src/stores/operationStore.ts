// Purpose: the run lifecycle for the three independent panel streams (feature #2, WI-6):
// Translate, Polish, and the Draft card's "Translate original" (draftTranslate). Each panel
// owns one AbortController per run and a monotonic runId; abort/reset/fail write their
// terminal/idle state SYNCHRONOUSLY (so the runId bump can never strand a panel in
// `streaming`), and every write inside the stream loop is guarded by the captured runId so a
// superseded run cannot clobber a newer one. The store consumes provider.streamOp and reads
// its normalized ProviderOutcome verbatim — it maps NO errors itself (rule 65). The live
// elapsed tick is the useElapsedTimer hook's job; the store owns startedAt + the frozen
// elapsedMs only.

import { create } from 'zustand'
import type { LLMProvider, LLMRequest, OperationState, ProviderError } from '@/providers/types'

export type PanelId = 'translate' | 'polish' | 'draftTranslate'

/** A panel's run state: the shipped OperationState union + timer/runId fields. `isAuto` records whether
 *  the run was triggered by auto-run (feature #11) vs a manual button — read by the AUTO tag. Captured
 *  once at run start and re-spread in every streaming patch so the tag never flickers mid-stream. */
export type PanelOp = OperationState & {
  startedAt: number | null
  elapsedMs: number | null
  runId: number
  isAuto: boolean
}

const IDLE: PanelOp = { status: 'idle', startedAt: null, elapsedMs: null, runId: 0, isAuto: false }

// Injectable clock (test seam) for deterministic startedAt / elapsedMs.
let clock: () => number = Date.now
/** Test-only: override the clock used for startedAt + frozen elapsedMs. */
export function setOperationClock(fn: () => number): void {
  clock = fn
}

// One AbortController per panel per run. Module-scope (never React/store state) so aborting
// one panel never touches another and controllers are not serialized into persisted state.
const controllers = new Map<PanelId, AbortController>()

/** Abort + drop the panel's in-flight controller, if any. */
function dropController(panel: PanelId): void {
  const c = controllers.get(panel)
  if (c) {
    c.abort()
    controllers.delete(panel)
  }
}

interface OperationStore {
  translate: PanelOp
  polish: PanelOp
  draftTranslate: PanelOp
  run(panel: PanelId, request: LLMRequest, provider: LLMProvider, isAuto?: boolean): Promise<void>
  abort(panel: PanelId): void
  reset(panel: PanelId): void
  fail(panel: PanelId, error: ProviderError): void
}

export const useOperationStore = create<OperationStore>((set, get) => {
  const patch = (panel: PanelId, op: PanelOp) => set({ [panel]: op } as Pick<OperationStore, PanelId>)

  return {
    translate: IDLE,
    polish: IDLE,
    draftTranslate: IDLE,

    abort(panel) {
      const cur = get()[panel]
      dropController(panel)
      patch(panel, {
        status: 'cancelled',
        text: cur.status === 'idle' ? '' : cur.text,
        startedAt: cur.startedAt,
        elapsedMs: cur.startedAt === null ? null : clock() - cur.startedAt,
        runId: cur.runId + 1,
        isAuto: cur.isAuto,
      })
    },

    reset(panel) {
      const cur = get()[panel]
      dropController(panel)
      patch(panel, { status: 'idle', startedAt: null, elapsedMs: null, runId: cur.runId + 1, isAuto: false })
    },

    fail(panel, error) {
      const cur = get()[panel]
      dropController(panel)
      patch(panel, { status: 'error', text: '', error, startedAt: null, elapsedMs: null, runId: cur.runId + 1, isAuto: cur.isAuto })
    },

    async run(panel, request, provider, isAuto = false) {
      // Re-entrancy: a streaming panel's run button aborts; it never starts a second stream.
      if (get()[panel].status === 'streaming') {
        get().abort(panel)
        return
      }

      const runId = get()[panel].runId + 1
      const controller = new AbortController()
      controllers.set(panel, controller)
      const startedAt = clock()
      patch(panel, { status: 'streaming', text: '', startedAt, elapsedMs: null, runId, isAuto })

      const isStale = () => get()[panel].runId !== runId
      const gen = provider.streamOp(request, { signal: controller.signal })
      let text = ''
      let res = await gen.next()
      while (!res.done) {
        if (isStale()) return
        text += res.value.text
        patch(panel, { status: 'streaming', text, startedAt, elapsedMs: null, runId, isAuto })
        res = await gen.next()
      }
      if (isStale()) return
      controllers.delete(panel)
      patch(panel, { ...res.value, startedAt, elapsedMs: clock() - startedAt, runId, isAuto })
    },
  }
})

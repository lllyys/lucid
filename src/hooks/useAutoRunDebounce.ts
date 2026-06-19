// Purpose: the debounced auto-run timer for a panel (feature #11, WI-1). When enabled, the panel calls
// `scheduleRun(request)` on every source edit; after the input settles (debounceMs) the hook fires
// `usePanelRun().run(panel, request, /*isAuto*/ true)` — reusing the manual run pipeline. Off-by-default
// is the panel's concern (the toggle); this hook only debounces. Guards (rule 65 cost + CJK IME safety):
//   - cheap rejects at schedule (never arm): composing (IME), text below minChars, provider not ready;
//   - IME-safe: a composition HOLDS the timer (compositionstart clears it) and only RE-ARMS on commit
//     (compositionend) from the full duration — never fires mid-compose;
//   - fire-time re-validation: the runId captured at schedule is re-checked at fire, so a newer edit /
//     manual run / abort (which bumps runId) makes a stale pending fire a no-op (usePanelRun.run also
//     re-checks isReady() at fire).
// The countdown ring is pure CSS: `pendingKey` increments on each (re)schedule so the panel can key the
// ring to restart the animation — NO per-frame remainingMs state (no re-render storm).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LLMRequest } from '@/providers/types'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore, type PanelId } from '@/stores/operationStore'
import { usePanelRun } from './usePanelRun'

const DEFAULT_DEBOUNCE_MS = 1500
/** Arm only once the trimmed input has at least this many chars (matches the manual non-empty guard). */
const DEFAULT_MIN_CHARS = 1

export interface AutoRunDebounce {
  isPending: boolean
  isComposing: boolean
  /** Increments on every (re)schedule — key the countdown ring off this to restart its CSS animation. */
  pendingKey: number
  scheduleRun: (request: LLMRequest) => void
  cancel: () => void
  onCompositionStart: () => void
  onCompositionEnd: (request: LLMRequest) => void
}

export function useAutoRunDebounce(
  panel: PanelId,
  opts: { minChars?: number; debounceMs?: number } = {},
): AutoRunDebounce {
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const minChars = opts.minChars ?? DEFAULT_MIN_CHARS
  const { run } = usePanelRun()
  const [isPending, setIsPending] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [pendingKey, setPendingKey] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composing = useRef(false) // synchronous mirror of isComposing — onChange fires right after start

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    clear()
    setIsPending(false)
  }, [clear])

  const scheduleRun = useCallback(
    (request: LLMRequest) => {
      if (composing.current) return // held during IME composition; re-armed on compositionend
      if (request.text.trim().length < minChars) {
        cancel()
        return
      }
      if (!useProviderStore.getState().isReady()) {
        cancel()
        return
      }
      clear()
      const capturedRunId = useOperationStore.getState()[panel].runId
      setIsPending(true)
      setPendingKey((k) => k + 1)
      timer.current = setTimeout(() => {
        timer.current = null
        setIsPending(false)
        // A newer edit / manual run / abort bumps runId → this stale pending is a no-op.
        if (useOperationStore.getState()[panel].runId !== capturedRunId) return
        run(panel, request, true)
      }, debounceMs)
    },
    [panel, minChars, debounceMs, run, clear, cancel],
  )

  const onCompositionStart = useCallback(() => {
    composing.current = true
    setIsComposing(true)
    cancel() // hold: nothing fires mid-compose
  }, [cancel])

  const onCompositionEnd = useCallback(
    (request: LLMRequest) => {
      composing.current = false
      setIsComposing(false)
      scheduleRun(request) // re-arm from the full duration on commit
    },
    [scheduleRun],
  )

  useEffect(() => clear, [clear]) // clear the timer on unmount (StrictMode-safe)

  return { isPending, isComposing, pendingKey, scheduleRun, cancel, onCompositionStart, onCompositionEnd }
}

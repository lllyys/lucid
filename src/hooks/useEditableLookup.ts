// Purpose: thin React glue (feature #169, WI-2) over the PURE arm reducer in
// src/lib/lookup/editableLookupState.ts. Owns the `mode` state and the live editor signals
// (typing/composing); derives `armed` via isArmed. Wires window-level Alt key listeners
// (keydown→altDown, keyup→altUp), treats an Alt+other-key combo or Escape as an exit, and resets
// to 'off' on window blur + document visibilitychange so a Cmd/Option-Tab away never leaves Alt
// stuck (L9). A ~400 ms typing debounce disarms while editing and re-arms after the input
// settles; IME composition (window compositionstart/end or setComposing) suppresses arming. The
// branch-heavy decision lives in the gated reducer; this hook is the impure adapter.

import { useCallback, useEffect, useRef, useState } from 'react'
import { isArmed, nextMode, type LookupEvent, type LookupMode } from '@/lib/lookup/editableLookupState'

/** Default idle delay after the last keystroke before the overlay re-arms. */
const DEFAULT_TYPING_DEBOUNCE_MS = 400

export interface UseEditableLookupOptions {
  /** Whether the underlying field has text (empty → never armed). The pane supplies this. */
  textNonEmpty: boolean
  /** Whether the field is being machine-written (e.g. Draft streaming) — disarms the overlay. */
  streaming?: boolean
  /** Override the typing-debounce idle delay (ms). */
  typingDebounceMs?: number
}

export interface EditableLookup {
  mode: LookupMode
  /** Derived: whether the overlay should capture word clicks right now. */
  armed: boolean
  typing: boolean
  composing: boolean
  /** Call on every textarea input — disarms while typing, re-arms after the debounce settles. */
  onTextInput: () => void
  /** Flip the latched lookup mode (the ⌕ toggle / touch entry). */
  toggle: () => void
  /** Hard-exit lookup mode (Esc / the first edit key). */
  exit: () => void
  /** Drive IME composition suppression from the textarea (in addition to window events). */
  setComposing: (composing: boolean) => void
}

export function useEditableLookup(opts: UseEditableLookupOptions): EditableLookup {
  const { textNonEmpty, streaming = false } = opts
  const debounceMs = opts.typingDebounceMs ?? DEFAULT_TYPING_DEBOUNCE_MS

  const [mode, setMode] = useState<LookupMode>('off')
  const [typing, setTyping] = useState(false)
  const [composing, setComposingState] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dispatch = useCallback((event: LookupEvent) => {
    setMode((m) => nextMode(m, event))
  }, [])

  const toggle = useCallback(() => dispatch('toggle'), [dispatch])
  const exit = useCallback(() => dispatch('exit'), [dispatch])
  const setComposing = useCallback((c: boolean) => setComposingState(c), [])

  const clearTypingTimer = useCallback(() => {
    if (typingTimer.current !== null) {
      clearTimeout(typingTimer.current)
      typingTimer.current = null
    }
  }, [])

  const onTextInput = useCallback(() => {
    setTyping(true)
    clearTypingTimer()
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null
      setTyping(false)
    }, debounceMs)
  }, [clearTypingTimer, debounceMs])

  // Alt-key arm/disarm + Esc/edit exit. Window-level so modifier combos arrive even when the
  // textarea is not focused; an Alt+other-key combo is a shortcut/edit, not an arm gesture.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        dispatch('altDown')
        return
      }
      if (e.key === 'Escape') {
        dispatch('exit')
        return
      }
      if (e.altKey) dispatch('editKey')
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') dispatch('altUp')
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [dispatch])

  // L9: a Cmd/Option-Tab away never leaves Alt stuck — reset on blur + visibility change.
  useEffect(() => {
    const reset = () => dispatch('exit')
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', reset)
    return () => {
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [dispatch])

  // IME composition suppression — composition events bubble to window.
  useEffect(() => {
    const onStart = () => setComposingState(true)
    const onEnd = () => setComposingState(false)
    window.addEventListener('compositionstart', onStart)
    window.addEventListener('compositionend', onEnd)
    return () => {
      window.removeEventListener('compositionstart', onStart)
      window.removeEventListener('compositionend', onEnd)
    }
  }, [])

  useEffect(() => clearTypingTimer, [clearTypingTimer]) // clear the pending timer on unmount

  const armed = isArmed({ mode, textNonEmpty, typing, streaming, composing })

  return { mode, armed, typing, composing, onTextInput, toggle, exit, setComposing }
}

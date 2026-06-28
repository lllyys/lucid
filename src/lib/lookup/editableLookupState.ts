// Purpose: the PURE arm-decision + mode machine for word-lookup inside editable fields
// (feature #169, WI-2). No React, no DOM. `isArmed` decides whether the mirror overlay captures
// clicks; `nextMode` is the deterministic mode transition table the hook drives from Alt /
// toggle / exit / edit events. Lives in src/lib/lookup/** so every branch is 100%-coverage-gated
// — the impure adapter is the thin glue in src/hooks/useEditableLookup.ts.

/** Lookup mode of an editable pane: off (inert), alt (transient Alt-hold), latched (toggled on). */
export type LookupMode = 'off' | 'alt' | 'latched'

/** Events that drive the mode machine. */
export type LookupEvent = 'altDown' | 'altUp' | 'toggle' | 'exit' | 'editKey'

/** Inputs the arm decision reads: the mode plus the live editor signals that must hold it off. */
export interface ArmInputs {
  mode: LookupMode
  /** Whether the field has any text to look up. */
  textNonEmpty: boolean
  /** Whether the user is mid-edit (debounced) — disarm so the caret stays sacred. */
  typing: boolean
  /** Whether the field is being machine-written (e.g. Draft streaming) — offsets are unstable. */
  streaming: boolean
  /** Whether an IME composition is in flight. */
  composing: boolean
}

/**
 * The overlay is armed (captures word clicks) only when a lookup mode is active AND there is text
 * to look up AND nothing edit-like is in flight. Typing, machine streaming, and IME composition
 * each disarm so clicks fall through to the textarea (caret sacred) and anchored offsets never go
 * stale.
 */
export function isArmed({ mode, textNonEmpty, typing, streaming, composing }: ArmInputs): boolean {
  return mode !== 'off' && textNonEmpty && !typing && !streaming && !composing
}

/**
 * Deterministic mode transition. altDown arms the transient 'alt' (a standing 'latched' wins);
 * altUp drops 'alt' → 'off' but leaves a 'latched' standing; toggle flips 'latched' ↔ 'off' (and
 * latches from 'alt'); exit (Esc / window blur / visibility loss) and editKey (an Alt+other-key
 * shortcut fired while peeking — plain typing stays latched and disarms via the typing debounce
 * instead) always return to 'off'.
 */
export function nextMode(mode: LookupMode, event: LookupEvent): LookupMode {
  switch (event) {
    case 'altDown':
      return mode === 'latched' ? 'latched' : 'alt'
    case 'altUp':
      return mode === 'alt' ? 'off' : mode
    case 'toggle':
      return mode === 'latched' ? 'off' : 'latched'
    case 'exit':
    case 'editKey':
      return 'off'
  }
}

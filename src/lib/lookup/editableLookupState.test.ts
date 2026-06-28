import { describe, it, expect } from 'vitest'
import { isArmed, nextMode, type LookupMode, type LookupEvent } from './editableLookupState'

// WI-2 — pure arm-decision + mode machine for word-lookup inside editable fields (#169).

describe('isArmed', () => {
  const base = {
    mode: 'latched' as LookupMode,
    textNonEmpty: true,
    typing: false,
    streaming: false,
    composing: false,
  }

  it('is armed when a mode is active, text is non-empty, and nothing edit-like is in flight', () => {
    expect(isArmed(base)).toBe(true)
  })

  it('is armed in transient alt mode too', () => {
    expect(isArmed({ ...base, mode: 'alt' })).toBe(true)
  })

  it.each([
    ['mode is off', { mode: 'off' as LookupMode }],
    ['text is empty', { textNonEmpty: false }],
    ['typing (debounced)', { typing: true }],
    ['streaming (machine-written)', { streaming: true }],
    ['composing (IME)', { composing: true }],
  ])('is disarmed when %s', (_label, override) => {
    expect(isArmed({ ...base, ...override })).toBe(false)
  })
})

describe('nextMode', () => {
  // The transition table IS the spec — every (mode, event) pair is pinned here.
  const table: Array<[LookupMode, LookupEvent, LookupMode]> = [
    // altDown → 'alt', unless already latched (a standing latch wins)
    ['off', 'altDown', 'alt'],
    ['alt', 'altDown', 'alt'],
    ['latched', 'altDown', 'latched'],
    // altUp → 'off' only if it was the transient alt; leaves a latch (and off stays off)
    ['off', 'altUp', 'off'],
    ['alt', 'altUp', 'off'],
    ['latched', 'altUp', 'latched'],
    // toggle flips latched ↔ off; from alt it latches
    ['off', 'toggle', 'latched'],
    ['alt', 'toggle', 'latched'],
    ['latched', 'toggle', 'off'],
    // exit (Esc / blur) → off from any mode
    ['off', 'exit', 'off'],
    ['alt', 'exit', 'off'],
    ['latched', 'exit', 'off'],
    // editKey (first edit key / Alt+other-key) → off from any mode
    ['off', 'editKey', 'off'],
    ['alt', 'editKey', 'off'],
    ['latched', 'editKey', 'off'],
  ]

  it.each(table)('%s + %s → %s', (mode, event, expected) => {
    expect(nextMode(mode, event)).toBe(expected)
  })
})

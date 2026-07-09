// WI-1 / #26 — locks the two shared editor resting-min constants to the committed design
// (dev-docs/designs/lucid-editor-resting-height/). An intentional design change updates these
// deliberately; unintended drift is caught here. See editorSizing.ts.
import { describe, it, expect } from 'vitest'
import { EDITOR_FIELD_MIN_H, EDITOR_CARD_MIN_H } from './editorSizing'

describe('editor sizing constants (#26)', () => {
  it('pins the textarea resting min to min-h-[56px]', () => {
    expect(EDITOR_FIELD_MIN_H).toBe('min-h-[56px]')
  })

  it('pins the polish card min to min-h-[98px]', () => {
    expect(EDITOR_CARD_MIN_H).toBe('min-h-[98px]')
  })
})

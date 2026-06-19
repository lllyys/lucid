import { describe, it, expect } from 'vitest'
import { isRunNowShortcut } from './runNowShortcut'

const ev = (over: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean }>) =>
  ({ key: 'Enter', metaKey: false, ctrlKey: false, ...over }) as KeyboardEvent

describe('isRunNowShortcut', () => {
  it('fires on Cmd+Enter (mac)', () => {
    expect(isRunNowShortcut(ev({ metaKey: true }), true)).toBe(true)
  })

  it('fires on Ctrl+Enter (non-mac)', () => {
    expect(isRunNowShortcut(ev({ ctrlKey: true }), false)).toBe(true)
  })

  it('does NOT fire on Ctrl+Enter on mac (must be Cmd there)', () => {
    expect(isRunNowShortcut(ev({ ctrlKey: true }), true)).toBe(false)
  })

  it('does NOT fire on Cmd+Enter on non-mac (must be Ctrl there)', () => {
    expect(isRunNowShortcut(ev({ metaKey: true }), false)).toBe(false)
  })

  it('does NOT fire on a bare Enter', () => {
    expect(isRunNowShortcut(ev({}), true)).toBe(false)
    expect(isRunNowShortcut(ev({}), false)).toBe(false)
  })

  it('does NOT fire on Cmd + a non-Enter key', () => {
    expect(isRunNowShortcut(ev({ key: 'a', metaKey: true }), true)).toBe(false)
  })
})

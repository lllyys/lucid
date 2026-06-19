import { describe, it, expect, vi, afterEach } from 'vitest'
import { OPEN_SETTINGS_EVENT, openSettings, onOpenSettings } from './openSettings'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('openSettings', () => {
  it('dispatches the open-settings event on window', () => {
    const spy = vi.fn()
    window.addEventListener(OPEN_SETTINGS_EVENT, spy)
    openSettings()
    expect(spy).toHaveBeenCalledTimes(1)
    window.removeEventListener(OPEN_SETTINGS_EVENT, spy)
  })

  it('onOpenSettings invokes the handler when the event fires and returns an unsubscribe', () => {
    const handler = vi.fn()
    const off = onOpenSettings(handler)
    openSettings()
    expect(handler).toHaveBeenCalledTimes(1)
    off()
    openSettings()
    expect(handler).toHaveBeenCalledTimes(1) // no further calls after unsubscribe
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { LOAD_SOURCE_EVENT, loadSourceIntoWorkspace, onLoadSource } from './loadSource'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadSource', () => {
  it('dispatches the load-source event on window carrying the text in detail', () => {
    const spy = vi.fn()
    window.addEventListener(LOAD_SOURCE_EVENT, spy)
    loadSourceIntoWorkspace('héllo 你好')
    expect(spy).toHaveBeenCalledTimes(1)
    const evt = spy.mock.calls[0][0] as CustomEvent<{ text: string }>
    expect(evt.detail.text).toBe('héllo 你好')
    window.removeEventListener(LOAD_SOURCE_EVENT, spy)
  })

  it('onLoadSource receives the text and the returned unsubscribe removes the listener', () => {
    const handler = vi.fn()
    const off = onLoadSource(handler)
    loadSourceIntoWorkspace('first')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenLastCalledWith('first')
    off()
    loadSourceIntoWorkspace('second')
    expect(handler).toHaveBeenCalledTimes(1) // no further calls after unsubscribe
  })

  it('passes an empty string through (edge case — clearing the editor)', () => {
    const handler = vi.fn()
    const off = onLoadSource(handler)
    loadSourceIntoWorkspace('')
    expect(handler).toHaveBeenCalledWith('')
    off()
  })
})

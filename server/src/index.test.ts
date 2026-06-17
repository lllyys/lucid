import { describe, expect, it } from 'vitest'
import { SERVER_NAME } from './index.js'

describe('server scaffold', () => {
  it('exposes the server name placeholder', () => {
    expect(SERVER_NAME).toBe('lucid-sync-server')
  })
})

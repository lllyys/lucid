// WI-2 — the module-level cache of the server's advertised proxy allow-list (#28). The sync controller
// refreshes it on a token-free single-origin connect (GET /proxy); the run / test-connection call sites
// read it to decide shouldProxy. Any failure / bad shape / absent proxy → [] → the client stays direct.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getProxyAllowlist,
  setProxyAllowlist,
  clearProxyAllowlist,
  refreshProxyAllowlist,
} from './proxyAllowlist'

beforeEach(() => {
  clearProxyAllowlist()
})

describe('proxy allow-list cache', () => {
  it('starts empty', () => {
    expect(getProxyAllowlist()).toEqual([])
  })

  it('setProxyAllowlist / getProxyAllowlist round-trip', () => {
    setProxyAllowlist(['http://x/v1'])
    expect(getProxyAllowlist()).toEqual(['http://x/v1'])
  })

  it('clearProxyAllowlist resets to []', () => {
    setProxyAllowlist(['http://x/v1'])
    clearProxyAllowlist()
    expect(getProxyAllowlist()).toEqual([])
  })
})

describe('refreshProxyAllowlist', () => {
  it('fetches GET ${origin}/proxy and caches the advertised upstreams', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ upstreams: ['http://a/v1', 'http://b/v1'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const list = await refreshProxyAllowlist('https://app.example.com', fetchMock as unknown as typeof fetch)
    expect(fetchMock).toHaveBeenCalledWith('https://app.example.com/proxy')
    expect(list).toEqual(['http://a/v1', 'http://b/v1'])
    expect(getProxyAllowlist()).toEqual(['http://a/v1', 'http://b/v1'])
  })

  it('caches [] on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 }))
    const list = await refreshProxyAllowlist('https://app.example.com', fetchMock as unknown as typeof fetch)
    expect(list).toEqual([])
    expect(getProxyAllowlist()).toEqual([])
  })

  it('caches [] on a malformed shape (missing/invalid upstreams)', async () => {
    for (const bad of ['{}', '{"upstreams":"x"}', '{"upstreams":[1,2]}', '[]', 'null']) {
      setProxyAllowlist(['stale'])
      const fetchMock = vi.fn(async () => new Response(bad, { status: 200 }))
      const list = await refreshProxyAllowlist('https://app.example.com', fetchMock as unknown as typeof fetch)
      expect(list, `payload ${bad}`).toEqual([])
    }
  })

  it('caches [] when the fetch throws (network failure)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    setProxyAllowlist(['stale'])
    const list = await refreshProxyAllowlist('https://app.example.com', fetchMock as unknown as typeof fetch)
    expect(list).toEqual([])
    expect(getProxyAllowlist()).toEqual([])
  })

  it('caches [] when the 2xx body is not JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('not json{', { status: 200 }))
    const list = await refreshProxyAllowlist('https://app.example.com', fetchMock as unknown as typeof fetch)
    expect(list).toEqual([])
  })
})

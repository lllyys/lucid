import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSyncController } from './syncController'
import type { SyncBackend, BackendResult } from './backend'
import { useSyncStore } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { okBackend, term, tick, resetSyncStores } from '@/test/orchestratorHarness'

const CONFIG = { serverUrl: 'https://lucid.example', token: 'tok-1' }

const makeController = (backend: SyncBackend) =>
  createSyncController({
    createBackend: () => backend,
    now: () => 5000,
    debounceMs: 100,
    pollMs: 1000,
    isOnline: () => true,
    subscribeConnectivity: () => () => {},
  })

beforeEach(() => {
  vi.useFakeTimers()
  resetSyncStores()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createSyncController', () => {
  it('connect() stores the config, seeds the current local data into the queue, and starts syncing', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'API'), term('g2', 'ML')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)

    expect(useSyncStore.getState().config).toEqual(CONFIG)
    expect(useSyncStore.getState().seeded).toBe(true)
    // both pre-existing terms are seeded as expect-new ops (baseRev 0)
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id).sort()).toEqual(['g1', 'g2'])
    expect(useSyncQueueStore.getState().entries.every((e) => e.op.baseRev === 0)).toBe(true)
    expect(useSyncStore.getState().queuedCount).toBe(2)

    await tick() // the orchestrator's initial cycle runs
    expect(be.pull).toHaveBeenCalledOnce()
    await ctrl.disconnect()
  })

  it('connect() with no local data seeds nothing but still starts syncing', async () => {
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    expect(useSyncQueueStore.getState().entries).toEqual([])
    await tick()
    expect(be.pull).toHaveBeenCalledOnce()
    await ctrl.disconnect()
  })

  it('connect() clears stale queued ops from a prior server before seeding the current data', async () => {
    // a leftover op from a previous session (e.g. a tombstone for an entity no longer present locally)
    useSyncQueueStore.getState().enqueue({ type: 'term', id: 'old', payload: {}, updatedAt: 1, deletedAt: 1, baseRev: 7 })
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    // the stale 'old' op is gone; only the fresh seed for g1 (baseRev 0) remains
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['g1'])
    expect(useSyncQueueStore.getState().entries[0].op.baseRev).toBe(0)
    await tick()
    await ctrl.disconnect()
  })

  it('resume() re-attaches an already-seeded connection WITHOUT re-seeding', async () => {
    // simulate a reload: config + seeded persisted, local data present
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    useSyncStore.setState({ config: CONFIG, seeded: true })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.resume()
    expect(useSyncQueueStore.getState().entries).toEqual([]) // NOT re-seeded
    await tick()
    expect(be.pull).toHaveBeenCalledOnce() // orchestrator started
    await ctrl.disconnect()
  })

  it('resume() with no persisted config is a no-op (stays local-only, no backend built)', async () => {
    const be = okBackend()
    const createBackend = vi.fn(() => be)
    const ctrl = createSyncController({ createBackend, isOnline: () => true, subscribeConnectivity: () => () => {} })
    ctrl.resume()
    await tick()
    expect(createBackend).not.toHaveBeenCalled()
    expect(be.pull).not.toHaveBeenCalled()
    expect(useSyncStore.getState().status).toBe('local-only')
  })

  it('disconnect() stops syncing, purges the server, clears the queue, and reverts to local-only', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    await tick()
    clearMock(be)

    expect(await ctrl.disconnect()).toBe(true) // purge succeeded
    expect(be.purge).toHaveBeenCalledOnce()
    expect(useSyncQueueStore.getState().entries).toEqual([]) // queue cleared
    expect(useSyncStore.getState().config).toBeNull()
    expect(useSyncStore.getState().status).toBe('local-only')

    await vi.advanceTimersByTimeAsync(3000) // no further polls after disconnect
    expect(be.pull).not.toHaveBeenCalled()
  })

  it('disconnect() still reverts locally but reports false when the server purge fails (best-effort)', async () => {
    const be: SyncBackend = { ...okBackend(), purge: vi.fn(() => Promise.resolve<BackendResult<void>>({ ok: false, error: { kind: 'unreachable' } })) }
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    await tick()
    expect(await ctrl.disconnect()).toBe(false) // purge failed → surfaced so the UI can warn
    expect(be.purge).toHaveBeenCalledOnce()
    expect(useSyncStore.getState().config).toBeNull() // reset despite the purge failure
  })

  it('a connect() during a slow disconnect purge is not torn down by the disconnect tail', async () => {
    let resolvePurge: (v: BackendResult<void>) => void = () => {}
    const be1: SyncBackend = { ...okBackend(), purge: vi.fn(() => new Promise<BackendResult<void>>((res) => { resolvePurge = res })) }
    const be2 = okBackend()
    let n = 0
    const ctrl = createSyncController({
      createBackend: () => (n++ === 0 ? be1 : be2),
      now: () => 5000,
      debounceMs: 100,
      pollMs: 1000,
      isOnline: () => true,
      subscribeConnectivity: () => () => {},
    })
    ctrl.connect(CONFIG) // session 1 (be1)
    await tick()
    const disc = ctrl.disconnect() // stops orch, awaits be1.purge() (pending)
    ctrl.connect(CONFIG) // session 2 (be2) starts DURING the purge await
    await tick()
    resolvePurge({ ok: true, value: undefined }) // the stale disconnect tail resumes
    await disc
    // session 2 survived the stale tail
    expect(useSyncStore.getState().config).toEqual(CONFIG)
    expect(useSyncStore.getState().status).not.toBe('local-only')
    await ctrl.disconnect()
  })

  it('disconnect() before any connect is safe (no purge, stays local-only)', async () => {
    const be = okBackend()
    const ctrl = makeController(be)
    await ctrl.disconnect()
    expect(be.purge).not.toHaveBeenCalled()
    expect(useSyncStore.getState().config).toBeNull()
  })

  it('reconnecting after a disconnect re-seeds the current local data', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    await tick()
    await ctrl.disconnect()
    expect(useSyncQueueStore.getState().entries).toEqual([]) // cleared on disconnect

    ctrl.connect(CONFIG) // reconnect
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['g1']) // re-seeded
    await tick()
    await ctrl.disconnect()
  })

  it('builds a REST backend from the config by default when no createBackend is injected', async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchMock)
    // no createBackend → the default createRestSyncBackend(config) is used; offline so no drain/fetch
    const ctrl = createSyncController({ isOnline: () => false, subscribeConnectivity: () => () => {} })
    ctrl.connect(CONFIG)
    await tick()
    expect(fetchMock).not.toHaveBeenCalled() // offline → no pull/push
    await ctrl.disconnect() // purge → the default backend issues DELETE /sync/data via the real fetch
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://lucid.example/sync/data')
    expect(init.method).toBe('DELETE')
    vi.unstubAllGlobals()
  })

  it('connect() while already connected tears down the prior loop first (no leaked orchestrator)', async () => {
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    await tick()
    clearMock(be)
    ctrl.connect(CONFIG) // reconnect without an explicit disconnect
    await tick()
    // only ONE active orchestrator: a single poll tick triggers a single drain
    clearMock(be)
    await vi.advanceTimersByTimeAsync(1000)
    await tick()
    expect(be.pull).toHaveBeenCalledOnce()
    await ctrl.disconnect()
  })

  it('syncNow() forces an immediate sync cycle without waiting for the poll', async () => {
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    await tick()
    clearMock(be)
    ctrl.syncNow()
    await tick()
    expect(be.pull).toHaveBeenCalledOnce() // drained immediately, not on the 1000ms poll
    await ctrl.disconnect()
  })

  it('syncNow() is a no-op when local-only (never connected)', async () => {
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.syncNow()
    await tick()
    expect(be.pull).not.toHaveBeenCalled()
  })

  it('disconnect({ erase: false }) reverts to local-only WITHOUT purging the server (keep)', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    await tick()
    expect(await ctrl.disconnect({ erase: false })).toBe(true) // nothing purged → reported success
    expect(be.purge).not.toHaveBeenCalled() // server data KEPT for a later reconnect
    expect(useSyncQueueStore.getState().entries).toEqual([]) // queue still cleared
    expect(useSyncStore.getState().config).toBeNull() // reverted to local-only
    expect(useSyncStore.getState().status).toBe('local-only')
  })

  it('disconnect({ erase: true }) purges the server (explicit erase, same as the default)', async () => {
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    await tick()
    expect(await ctrl.disconnect({ erase: true })).toBe(true)
    expect(be.purge).toHaveBeenCalledOnce()
  })

  it('disconnect({ erase: false }) then reconnect re-seeds local data and never purges (server kept)', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    await tick()
    await ctrl.disconnect({ erase: false })
    expect(be.purge).not.toHaveBeenCalled()
    expect(useSyncQueueStore.getState().entries).toEqual([]) // queue cleared on disconnect

    ctrl.connect(CONFIG) // reconnect — server data was kept; re-seed the current local data
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['g1'])
    expect(be.purge).not.toHaveBeenCalled() // still never purged across the whole keep→reconnect cycle
    await tick()
    await ctrl.disconnect({ erase: false })
  })

  it('syncNow() while offline issues no pull and marks the status offline', async () => {
    const be = okBackend()
    const ctrl = createSyncController({
      createBackend: () => be,
      now: () => 5000,
      debounceMs: 100,
      pollMs: 1000,
      isOnline: () => false,
      subscribeConnectivity: () => () => {},
    })
    ctrl.connect(CONFIG)
    await tick() // initial drain sees offline
    clearMock(be)
    ctrl.syncNow()
    await tick()
    expect(be.pull).not.toHaveBeenCalled() // requestDrain's offline guard short-circuits
    expect(useSyncStore.getState().status).toBe('offline')
    await ctrl.disconnect({ erase: false })
  })
})

function clearMock(be: SyncBackend): void {
  ;(be.pull as ReturnType<typeof vi.fn>).mockClear()
  ;(be.push as ReturnType<typeof vi.fn>).mockClear()
}

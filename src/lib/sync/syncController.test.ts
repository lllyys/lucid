import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSyncController } from './syncController'
import type { SyncBackend, BackendResult } from './backend'
import { useSyncStore } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { useStarredStore } from '@/stores/starredStore'
import { okBackend, errBackend, deferredPullBackend, term, starredItem, tick, resetSyncStores } from '@/test/orchestratorHarness'

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

  it('connect() seeds a pre-existing starred item into the queue (else the initial seed never uploads it)', async () => {
    useStarredStore.setState({ items: [starredItem('st1', 'cat')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connect(CONFIG)
    const op = useSyncQueueStore.getState().entries.find((e) => e.op.id === 'st1')?.op
    expect(op).toMatchObject({ type: 'starred', id: 'st1', baseRev: 0, payload: { source: 'cat' } })
    await tick()
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

  // #19 WI-2 — connectSingleOrigin(): the controller affordance for token-free single-origin. It
  // connects to window.location.origin with an empty token (via the store's connectSingleOrigin),
  // seeds the current local data, and starts syncing — same flow as connect(), no typed token/URL.
  it('connectSingleOrigin() connects to window.location.origin token-free, seeds, and starts syncing', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connectSingleOrigin()

    expect(useSyncStore.getState().config).toEqual({ serverUrl: window.location.origin, token: '' })
    expect(useSyncStore.getState().config?.token).toBe('') // token-free
    expect(useSyncStore.getState().seeded).toBe(true)
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['g1']) // local data seeded
    await tick()
    expect(be.pull).toHaveBeenCalledOnce()
    await ctrl.disconnect()
  })

  it('connectSingleOrigin() clears stale queued ops from a prior server before seeding', async () => {
    useSyncQueueStore.getState().enqueue({ type: 'term', id: 'old', payload: {}, updatedAt: 1, deletedAt: 1, baseRev: 7 })
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    const be = okBackend()
    const ctrl = makeController(be)
    ctrl.connectSingleOrigin()
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['g1']) // 'old' dropped
    await tick()
    await ctrl.disconnect()
  })

  it('connectSingleOrigin() builds the default REST backend (empty token → no Authorization header)', async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchMock)
    // no createBackend → the default createRestSyncBackend(config) is used; offline so no drain/fetch on connect
    const ctrl = createSyncController({ isOnline: () => false, subscribeConnectivity: () => () => {} })
    ctrl.connectSingleOrigin()
    await tick()
    await ctrl.disconnect() // purge → DELETE /sync/data via the real fetch
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${window.location.origin}/sync/data`)
    expect(init.method).toBe('DELETE')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined() // token-free: no auth header
    vi.unstubAllGlobals()
  })

  // #21 — auto-sync on by default for a token-free single-origin server. maybeAutoConnect() probes the
  // served origin, and only surfaces a one-time consent flag (never silently connects); accept/decline
  // record the durable decision. reset() preserves autoSyncPrompt, so re-baseline it per test.
  describe('auto-sync (#21)', () => {
    beforeEach(() => {
      useSyncStore.setState({ autoSyncPrompt: 'unseen', showAutoPrompt: false })
    })

    it('maybeAutoConnect surfaces the consent prompt when the probe is eligible + unseen (does NOT connect)', async () => {
      const be = okBackend() // pull(0) → ok → eligible
      const createBackend = vi.fn(() => be)
      const ctrl = createSyncController({ createBackend, isOnline: () => true, subscribeConnectivity: () => () => {} })
      await ctrl.maybeAutoConnect()
      expect(useSyncStore.getState().showAutoPrompt).toBe(true) // consent surfaced
      expect(useSyncStore.getState().config).toBeNull() // NOT connected yet — consent first (rule 65 §6)
      expect(useSyncStore.getState().autoSyncPrompt).toBe('unseen') // decision deferred to accept/decline
      // L3 — the probe backend is built via the injectable createBackend with the served origin + empty token
      expect(createBackend).toHaveBeenCalledWith({ serverUrl: window.location.origin, token: '' })
      expect(be.pull).toHaveBeenCalledWith(0)
    })

    it('maybeAutoConnect is a no-op when the probe is ineligible (auth error → a tokened server)', async () => {
      const be = errBackend('auth') // pull(0) → auth → ineligible
      const createBackend = vi.fn(() => be)
      const ctrl = createSyncController({ createBackend, isOnline: () => true, subscribeConnectivity: () => () => {} })
      await ctrl.maybeAutoConnect()
      expect(useSyncStore.getState().showAutoPrompt).toBe(false)
      expect(useSyncStore.getState().config).toBeNull()
      expect(useSyncStore.getState().autoSyncPrompt).toBe('unseen')
    })

    it('maybeAutoConnect does NOT prompt when a manual connect lands during the in-flight probe (Gate-2 M4)', async () => {
      const probe = deferredPullBackend()
      const sync = okBackend()
      let n = 0
      const ctrl = createSyncController({
        createBackend: () => (n++ === 0 ? probe.backend : sync),
        now: () => 5000,
        debounceMs: 100,
        pollMs: 1000,
        isOnline: () => true,
        subscribeConnectivity: () => () => {},
      })
      const p = ctrl.maybeAutoConnect() // probe pull pending (createBackend #0)
      ctrl.connect(CONFIG) // manual connect mid-probe (createBackend #1 → sync) sets config
      await tick()
      probe.resolve({ ok: true, value: { changes: [], maxRev: 0 } }) // probe resolves eligible…
      await p
      // …but the post-await re-check sees config !== null → the manual session is not clobbered
      expect(useSyncStore.getState().showAutoPrompt).toBe(false)
      expect(useSyncStore.getState().config).toEqual(CONFIG)
      await ctrl.disconnect()
    })

    it('maybeAutoConnect does NOT prompt when a decision is made during the in-flight probe', async () => {
      const probe = deferredPullBackend()
      const createBackend = vi.fn(() => probe.backend)
      const ctrl = createSyncController({ createBackend, isOnline: () => true, subscribeConnectivity: () => () => {} })
      const p = ctrl.maybeAutoConnect() // probe pull pending
      useSyncStore.getState().setAutoSyncPrompt('declined') // user decides during the probe (e.g. another tab)
      probe.resolve({ ok: true, value: { changes: [], maxRev: 0 } }) // eligible…
      await p
      expect(useSyncStore.getState().showAutoPrompt).toBe(false) // …but autoSyncPrompt !== 'unseen' → no prompt
      expect(useSyncStore.getState().config).toBeNull()
    })

    it('acceptAutoSync connects single-origin token-free and records the accepted decision', async () => {
      useGlossaryStore.setState({ terms: [term('g1', 'API')] })
      const be = okBackend()
      const ctrl = makeController(be)
      useSyncStore.setState({ showAutoPrompt: true }) // prompt was showing
      ctrl.acceptAutoSync()
      expect(useSyncStore.getState().config).toEqual({ serverUrl: window.location.origin, token: '' }) // single-origin connect
      expect(useSyncStore.getState().autoSyncPrompt).toBe('accepted') // decision recorded + persisted
      expect(useSyncStore.getState().showAutoPrompt).toBe(false) // prompt dismissed
      expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['g1']) // local data seeded
      await tick()
      expect(be.pull).toHaveBeenCalledOnce() // syncing started
      await ctrl.disconnect()
    })

    it('declineAutoSync records the declined decision and never connects', async () => {
      const be = okBackend()
      const createBackend = vi.fn(() => be)
      const ctrl = createSyncController({ createBackend, isOnline: () => true, subscribeConnectivity: () => () => {} })
      useSyncStore.setState({ showAutoPrompt: true })
      ctrl.declineAutoSync()
      expect(useSyncStore.getState().autoSyncPrompt).toBe('declined') // declined users are never re-asked
      expect(useSyncStore.getState().showAutoPrompt).toBe(false)
      expect(useSyncStore.getState().config).toBeNull() // stays local-only
      await tick()
      expect(createBackend).not.toHaveBeenCalled() // no connect → no backend built
      expect(be.pull).not.toHaveBeenCalled()
    })
  })
})

function clearMock(be: SyncBackend): void {
  ;(be.pull as ReturnType<typeof vi.fn>).mockClear()
  ;(be.push as ReturnType<typeof vi.fn>).mockClear()
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSyncOrchestrator } from './syncOrchestrator'
import type { SyncBackend } from './backend'
import { useSyncStore } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import {
  NOW,
  term,
  okBackend,
  errBackend,
  deferredPullBackend,
  makeOrchestrator as make,
  tick,
  connected,
  resetSyncStores,
  type Harness,
} from '@/test/orchestratorHarness'

const clearPull = (be: SyncBackend) => (be.pull as ReturnType<typeof vi.fn>).mockClear()

beforeEach(() => {
  vi.useFakeTimers()
  resetSyncStores()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createSyncOrchestrator', () => {
  it('start() pulls immediately (initial sync on connect) and stamps lastSynced on success', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: true })
    orch.start()
    await tick()
    expect(be.pull).toHaveBeenCalledOnce()
    expect(useSyncStore.getState().lastSyncedAt).toBe(NOW)
    orch.stop()
  })

  it('debounces a local edit into one drain (fires after debounceMs, not before)', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: true })
    orch.start()
    await tick()
    clearPull(be)

    useGlossaryStore.setState({ terms: [term('g1', 'a')] }) // edit → editTracker enqueues + onEdit
    await vi.advanceTimersByTimeAsync(50)
    expect(be.pull).not.toHaveBeenCalled() // debounce not elapsed
    await vi.advanceTimersByTimeAsync(60) // now past 100ms
    expect(be.pull).toHaveBeenCalledOnce()
    orch.stop()
  })

  it('coalesces rapid edits into a single drain (debounce resets)', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: true })
    orch.start()
    await tick()
    clearPull(be)

    useGlossaryStore.setState({ terms: [term('g1', 'a')] })
    await vi.advanceTimersByTimeAsync(60)
    useGlossaryStore.setState({ terms: [term('g1', 'b')] }) // resets the debounce
    await vi.advanceTimersByTimeAsync(60) // 60 since the 2nd edit → not yet
    expect(be.pull).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50) // past 100 from the 2nd edit
    expect(be.pull).toHaveBeenCalledOnce()
    orch.stop()
  })

  it('runs at most one cycle at a time and reruns once for triggers that arrive mid-flight', async () => {
    connected()
    const { backend, pull, resolve } = deferredPullBackend()
    const orch = make(backend, { online: true })
    orch.start() // initial drain → pull #1 pending
    await tick()
    expect(pull).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(1000) // a poll fires while cycle #1 is in flight
    expect(pull).toHaveBeenCalledOnce() // not a second concurrent cycle
    resolve({ ok: true, value: { changes: [], maxRev: 0 } }) // cycle #1 completes
    await tick()
    expect(pull).toHaveBeenCalledTimes(2) // the queued rerun fires exactly once
    resolve({ ok: true, value: { changes: [], maxRev: 0 } })
    await tick()
    orch.stop()
  })

  it('polls periodically while connected and online', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: true })
    orch.start()
    await tick() // initial
    clearPull(be)
    await vi.advanceTimersByTimeAsync(1000)
    await tick()
    expect(be.pull).toHaveBeenCalledOnce() // one poll tick
    orch.stop()
  })

  it('does not drain while offline — it sets the offline status instead', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: false })
    orch.start()
    await tick()
    expect(be.pull).not.toHaveBeenCalled()
    expect(useSyncStore.getState().status).toBe('offline')
    orch.stop()
  })

  it('drains when connectivity returns, and marks offline when it drops', async () => {
    connected()
    const be = okBackend()
    const h: Harness = { online: false }
    const orch = make(be, h)
    orch.start()
    await tick()
    expect(useSyncStore.getState().status).toBe('offline')

    h.online = true
    h.conn?.() // online event
    await tick()
    expect(be.pull).toHaveBeenCalledOnce()

    h.online = false
    h.conn?.() // offline event
    await tick()
    expect(useSyncStore.getState().status).toBe('offline')
    orch.stop()
  })

  it('forces offline status when connectivity drops mid-cycle, but still commits the fetched data', async () => {
    connected()
    const { backend, resolve } = deferredPullBackend()
    const h: Harness = { online: true }
    const orch = make(backend, h)
    orch.start() // cycle pending
    await tick()
    h.online = false
    h.conn?.() // offline event fires DURING the in-flight cycle → status 'offline'
    resolve({ ok: true, value: { changes: [], maxRev: 4 } }) // cycle succeeds and commits
    await tick()
    expect(useSyncStore.getState().cursor).toBe(4) // data WAS committed (the pull succeeded)
    expect(useSyncStore.getState().lastSyncedAt).toBe(NOW) // and stamped
    expect(useSyncStore.getState().status).toBe('offline') // but status re-asserts offline (no self-correct otherwise)
    orch.stop()
  })

  it('re-asserts offline when connectivity drops mid-cycle and the request then fails unreachable', async () => {
    connected()
    const { backend, resolve } = deferredPullBackend()
    const h: Harness = { online: true }
    const orch = make(backend, h)
    orch.start()
    await tick()
    h.online = false
    h.conn?.() // offline event during the in-flight cycle → 'offline'
    resolve({ ok: false, error: { kind: 'unreachable' } }) // cycle then errors → runSyncCycle sets 'unreachable'
    await tick()
    expect(useSyncStore.getState().status).toBe('offline') // navigator-offline wins over 'unreachable'
    orch.stop()
  })

  it('pauses auto-draining after an auth error (no further cycles until restart)', async () => {
    connected()
    const be = errBackend('auth')
    const orch = make(be, { online: true })
    orch.start()
    await tick()
    expect(useSyncStore.getState().status).toBe('auth-error')
    expect(be.pull).toHaveBeenCalledOnce()
    expect(useSyncStore.getState().lastSyncedAt).toBeNull() // no success stamp

    await vi.advanceTimersByTimeAsync(1000) // a poll tick
    await tick()
    expect(be.pull).toHaveBeenCalledOnce() // still paused — did NOT retry
    orch.stop()
  })

  it('keeps polling after an unreachable error (server may recover)', async () => {
    connected()
    const be = errBackend('unreachable')
    const orch = make(be, { online: true })
    orch.start()
    await tick()
    expect(useSyncStore.getState().status).toBe('unreachable')
    await vi.advanceTimersByTimeAsync(1000)
    await tick()
    expect(be.pull).toHaveBeenCalledTimes(2) // retried on the poll tick
    orch.stop()
  })

  it('does not drain without a connection config (defensive gate)', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: true })
    orch.start()
    await tick()
    clearPull(be)
    useSyncStore.setState({ config: null }) // disconnect raced an in-flight poll
    await vi.advanceTimersByTimeAsync(1000) // poll tick
    await tick()
    expect(be.pull).not.toHaveBeenCalled()
    orch.stop()
  })

  it('does NOT commit a cycle that resolves after stop() (no stale resurrection of sync state)', async () => {
    connected()
    const { backend, pull, resolve } = deferredPullBackend()
    const orch = make(backend, { online: true })
    orch.start() // initial drain → pull pending
    await tick()
    expect(pull).toHaveBeenCalledOnce()

    orch.stop() // teardown mid-cycle (epoch bumped)
    resolve({ ok: true, value: { changes: [], maxRev: 5 } }) // the stale cycle resolves AFTER stop
    await tick()

    expect(useSyncStore.getState().cursor).toBe(0) // NOT advanced to 5 — the commit was skipped
    expect(useSyncStore.getState().lastSyncedAt).toBeNull()
    expect(useSyncStore.getState().revs).toEqual({})
  })
})

describe('createSyncOrchestrator — lifecycle / teardown', () => {
  it('stop() tears down: no further polls, debounced edits, or tracked edits drain', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: true })
    orch.start()
    await tick()
    orch.stop()
    clearPull(be)

    await vi.advanceTimersByTimeAsync(3000) // polls would have fired
    useGlossaryStore.setState({ terms: [term('g1', 'a')] }) // edit after stop
    await vi.advanceTimersByTimeAsync(200)
    expect(be.pull).not.toHaveBeenCalled()
    expect(useSyncQueueStore.getState().entries).toEqual([]) // tracker unsubscribed → nothing enqueued
  })

  it('stop() cancels a pending debounced edit (no drain fires after teardown)', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: true })
    orch.start()
    await tick()
    clearPull(be)

    useGlossaryStore.setState({ terms: [term('g1', 'a')] }) // schedules the debounce timer
    orch.stop() // before debounceMs elapses → the pending editTimer is cleared
    await vi.advanceTimersByTimeAsync(200)
    expect(be.pull).not.toHaveBeenCalled()
  })

  it('start() is idempotent and stop() is safe before start', async () => {
    connected()
    const be = okBackend()
    const orch = make(be, { online: true })
    orch.stop() // before start — no-op
    orch.start()
    orch.start() // second start — no extra timers/initial drains
    await tick()
    expect(be.pull).toHaveBeenCalledOnce()
    orch.stop()
  })

  it('uses real window/navigator defaults when not injected', async () => {
    connected()
    const be = okBackend()
    const orch = createSyncOrchestrator({ backend: be }) // all defaults: now, debounceMs, pollMs, isOnline, subscribeConnectivity
    orch.start()
    await tick()
    expect(be.pull).toHaveBeenCalledOnce() // navigator.onLine is true in jsdom
    expect(typeof useSyncStore.getState().lastSyncedAt).toBe('number') // default now = Date.now

    clearPull(be)
    window.dispatchEvent(new Event('online')) // default subscribeConnectivity wired the listener
    await tick()
    expect(be.pull).toHaveBeenCalledOnce()
    orch.stop() // default cleanup removes the window listeners
  })
})

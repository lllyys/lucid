import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runSyncCycle } from './runSyncCycle'
import { isApplyingSync } from './applyGuard'
import type { SyncBackend, BackendResult } from './backend'
import type { PullResult, PushResult, PushOp, SyncEntity } from './types'
import { useSyncStore } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useGlossaryStore, type Term } from '@/stores/glossaryStore'
import { useSessionStore } from '@/stores/sessionStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'

const term = (id: string, label: string): Term => ({ id, label, createdAt: 1, updatedAt: 1, deletedAt: null })
const remoteTerm = (id: string, label: string, rev: number): SyncEntity => ({
  type: 'term',
  id,
  payload: { label, createdAt: 1 },
  updatedAt: 1,
  deletedAt: null,
  rev,
})
const termOp = (id: string, baseRev = 0): PushOp => ({ type: 'term', id, payload: { label: 'mine', createdAt: 1 }, updatedAt: 1, deletedAt: null, baseRev })

const backend = (pull: BackendResult<PullResult>, push: BackendResult<PushResult[]>): SyncBackend => ({
  pull: vi.fn(() => Promise.resolve(pull)),
  push: vi.fn(() => Promise.resolve(push)),
  purge: vi.fn(),
})

beforeEach(() => {
  useSessionStore.getState().reset()
  useGlossaryStore.getState().reset()
  usePolishKeywordsStore.getState().reset()
  useSyncStore.getState().reset()
  useSyncQueueStore.getState().reset()
})

describe('runSyncCycle', () => {
  it('commits a cycle: reconciles pulled + pushed changes into the stores, advances rev map + cursor, acks the queue', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'mine')] })
    useSessionStore.setState({
      sessions: [
        {
          id: 's1',
          name: 'S',
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
          tasks: [{ id: 't1', kind: 'translate', title: 'T', sourceText: 'x', resultText: 'y', createdAt: 1, updatedAt: 1, deletedAt: null }],
        },
      ],
    })
    useSyncQueueStore.getState().enqueue(termOp('g1', 0))
    const statuses: string[] = []
    const unsub = useSyncStore.subscribe((s) => statuses.push(s.status))

    const be = backend(
      { ok: true, value: { changes: [remoteTerm('g2', 'New', 3)], maxRev: 3 } },
      { ok: true, value: [{ status: 'applied', id: 'g1', rev: 5 }] },
    )
    await runSyncCycle(be)
    unsub()

    expect(useGlossaryStore.getState().terms.map((t) => t.id).sort()).toEqual(['g1', 'g2'])
    // pushed g1 → 5, pulled g2 → 3; the local-kept s1/t1 carry their never-synced rev 0 (no regression).
    expect(useSyncStore.getState().revs).toEqual({ s1: 0, t1: 0, g1: 5, g2: 3 })
    expect(useSyncStore.getState().cursor).toBe(3)
    expect(useSyncQueueStore.getState().entries).toEqual([]) // g1 acked
    expect(useSyncStore.getState().queuedCount).toBe(0)
    expect(useSyncStore.getState().counts).toEqual({ sessions: 1, tasks: 1, terms: 2, keywords: 0 })
    expect(useSyncStore.getState().status).toBe('idle')
    expect(statuses).toContain('syncing') // entered the syncing state before settling
  })

  it('maps an auth failure to auth-error and commits nothing else', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'mine')] })
    await runSyncCycle(backend({ ok: false, error: { kind: 'auth' } }, { ok: true, value: [] }))
    expect(useSyncStore.getState().status).toBe('auth-error')
    expect(useSyncStore.getState().cursor).toBe(0) // untouched
    expect(useGlossaryStore.getState().terms).toEqual([term('g1', 'mine')]) // untouched
  })

  it('maps an unreachable failure to unreachable', async () => {
    await runSyncCycle(backend({ ok: false, error: { kind: 'unreachable' } }, { ok: true, value: [] }))
    expect(useSyncStore.getState().status).toBe('unreachable')
  })

  it('maps a badRequest failure to unreachable', async () => {
    await runSyncCycle(backend({ ok: false, error: { kind: 'badRequest' } }, { ok: true, value: [] }))
    expect(useSyncStore.getState().status).toBe('unreachable')
  })

  it('surfaces a conflict: server wins in the store, status conflict, lastConflict set', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'mine')] })
    useSyncQueueStore.getState().enqueue(termOp('g1', 1))
    useSyncStore.setState({ revs: { g1: 1 }, cursor: 1 })

    await runSyncCycle(backend({ ok: true, value: { changes: [remoteTerm('g1', 'theirs', 9)], maxRev: 9 } }, { ok: true, value: [] }))

    expect(useGlossaryStore.getState().terms).toEqual([term('g1', 'theirs')]) // server wins
    expect(useSyncStore.getState().cursor).toBe(9)
    expect(useSyncStore.getState().revs).toEqual({ g1: 9 })
    expect(useSyncStore.getState().status).toBe('conflict')
    // exactly the surfaced signal {type,id} — NOT the full Conflict with local/server payloads
    expect(useSyncStore.getState().lastConflict).toEqual({ type: 'term', id: 'g1' })
  })

  it('clears lastConflict on a clean cycle (status reflects the latest cycle)', async () => {
    useSyncStore.setState({ lastConflict: { type: 'term', id: 'old' } })
    await runSyncCycle(backend({ ok: true, value: { changes: [], maxRev: 0 } }, { ok: true, value: [] }))
    expect(useSyncStore.getState().status).toBe('idle')
    expect(useSyncStore.getState().lastConflict).toBeNull()
  })

  it('skips the entire commit when shouldCommit() is false (a stale cycle after stop/disconnect)', async () => {
    useGlossaryStore.setState({ terms: [term('g1', 'mine')] })
    useSyncStore.setState({ cursor: 7 })
    await runSyncCycle(
      backend({ ok: true, value: { changes: [remoteTerm('g2', 'New', 3)], maxRev: 3 } }, { ok: true, value: [] }),
      () => false,
    )
    expect(useGlossaryStore.getState().terms).toEqual([term('g1', 'mine')]) // g2 NOT applied
    expect(useSyncStore.getState().cursor).toBe(7) // unchanged
    expect(useSyncStore.getState().revs).toEqual({}) // unchanged
    expect(useSyncStore.getState().lastSyncedAt).toBeNull()
    expect(useSyncStore.getState().status).toBe('syncing') // set pre-await; no post-await commit
  })

  it('commits the domain-store writes UNDER the echo guard (so the edit subscription can skip them)', async () => {
    let guardedDuringWrite = false
    const unsub = useGlossaryStore.subscribe(() => {
      guardedDuringWrite = isApplyingSync()
    })
    await runSyncCycle(backend({ ok: true, value: { changes: [remoteTerm('g2', 'New', 3)], maxRev: 3 } }, { ok: true, value: [] }))
    unsub()
    expect(guardedDuringWrite).toBe(true)
  })
})

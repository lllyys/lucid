import { describe, it, expect, vi } from 'vitest'
import { syncPull } from './pull'
import type { SyncBackend, BackendResult } from './backend'
import type { PullResult, SyncEntity } from './types'
import type { Term } from '@/stores/glossaryStore'

const term = (id: string, label: string): Term => ({ id, label, createdAt: 1, updatedAt: 1, deletedAt: null })
const remoteTerm = (id: string, label: string, rev: number): SyncEntity => ({
  type: 'term',
  id,
  payload: { label, createdAt: 1 },
  updatedAt: 1,
  deletedAt: null,
  rev,
})

// A backend whose pull() returns `result`; push/purge are unused by syncPull.
const backendWith = (result: BackendResult<PullResult>): SyncBackend => ({
  pull: vi.fn(() => Promise.resolve(result)),
  push: vi.fn(),
  purge: vi.fn(),
})

const snapshot = (terms: Term[] = []) => ({ sessions: [], terms, keywords: [] })
const NO_REVS: ReadonlyMap<string, number> = new Map()
const NONE: ReadonlySet<string> = new Set()

describe('syncPull', () => {
  it('returns the mapped error when the pull fails (and does not touch local state)', async () => {
    for (const kind of ['unreachable', 'auth', 'badRequest'] as const) {
      const out = await syncPull(backendWith({ ok: false, error: { kind } }), 0, snapshot(), NO_REVS, NONE)
      expect(out).toEqual({ ok: false, error: { kind } })
    }
  })

  it('pulls from the cursor, adopts new remote entities, advances the cursor, and reports their revs', async () => {
    const backend = backendWith({ ok: true, value: { changes: [remoteTerm('g1', 'API', 3)], maxRev: 3 } })
    const out = await syncPull(backend, 0, snapshot(), NO_REVS, NONE)
    expect(backend.pull).toHaveBeenCalledWith(0)
    expect(out).toMatchObject({ ok: true, cursor: 3, conflicts: [] })
    if (out.ok) {
      expect(out.snapshot.terms).toEqual([term('g1', 'API')])
      expect(out.revUpdates).toEqual({ g1: 3 }) // orchestrator records the new server rev
      expect(out.resolved).toEqual([remoteTerm('g1', 'API', 3)]) // raw merge output the cycle engine applies
    }
  })

  it('an empty pull is a no-op apply that still advances the cursor', async () => {
    const cur = snapshot([term('g9', 'Keep')])
    const out = await syncPull(backendWith({ ok: true, value: { changes: [], maxRev: 7 } }), 5, cur, NO_REVS, NONE)
    expect(out).toMatchObject({ ok: true, cursor: 7, conflicts: [] })
    if (out.ok) expect(out.snapshot.terms).toEqual([term('g9', 'Keep')]) // unchanged
  })

  it('carries a non-pending entity’s last-synced rev into revUpdates (no regression to 0)', async () => {
    // g1 was synced at rev 5 and is unchanged locally + on the server (empty pull). Its rev must NOT
    // regress to 0 in revUpdates — else a future local edit would push from baseRev 0 and false-conflict.
    // This is why collectLocal is fed the FULL rev map, not just the pending base revs.
    const cur = snapshot([term('g1', 'API')])
    const revs = new Map([['g1', 5]])
    const out = await syncPull(backendWith({ ok: true, value: { changes: [], maxRev: 5 } }), 5, cur, revs, NONE)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.snapshot.terms).toEqual([term('g1', 'API')])
      expect(out.revUpdates).toEqual({ g1: 5 })
    }
  })

  it('adopts a higher-rev remote for a NON-pending entity and reports the advanced rev', async () => {
    const cur = snapshot([term('g1', 'mine')])
    const revs = new Map([['g1', 2]]) // last synced at 2, not pending (no local edit)
    const out = await syncPull(backendWith({ ok: true, value: { changes: [remoteTerm('g1', 'theirs', 7)], maxRev: 7 } }), 2, cur, revs, NONE)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.snapshot.terms).toEqual([term('g1', 'theirs')]) // server authoritative — no edit at risk
      expect(out.conflicts).toEqual([])
      expect(out.revUpdates).toEqual({ g1: 7 })
    }
  })

  it('advances the cursor monotonically — never below the requested cursor (buggy server maxRev < cursor)', async () => {
    const out = await syncPull(backendWith({ ok: true, value: { changes: [], maxRev: 3 } }), 10, snapshot(), NO_REVS, NONE)
    expect(out).toMatchObject({ ok: true, cursor: 10 }) // stays at 10, not 3
  })

  it('advances the cursor to the highest applied rev even if maxRev under-reports it', async () => {
    const backend = backendWith({ ok: true, value: { changes: [remoteTerm('g1', 'API', 9)], maxRev: 3 } })
    const out = await syncPull(backend, 1, snapshot(), NO_REVS, NONE)
    expect(out).toMatchObject({ ok: true, cursor: 9 }) // max(1, 3, 9) — won't re-pull g1 next cycle
  })

  it('handles a large pull batch without throwing (folds the cursor with reduce, not a spread)', async () => {
    const N = 50000 // a big initial-sync / malicious batch — `Math.max(...changes)` would RangeError here
    const changes: SyncEntity[] = Array.from({ length: N }, (_, i) => ({
      type: 'keyword',
      id: `kw_${i}`,
      payload: {},
      updatedAt: 1,
      deletedAt: 1, // tombstones → reconcile deletes by id (cheap), no reconstruction needed
      rev: i + 1,
    }))
    const out = await syncPull(backendWith({ ok: true, value: { changes, maxRev: 1 } }), 0, snapshot(), NO_REVS, NONE)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.cursor).toBe(N) // max(0, 1, 1..N) = N
      expect(Object.keys(out.revUpdates)).toHaveLength(N) // every resolved entity's rev is reported
    }
  })

  it('records a conflict when a pending local edit is superseded by a higher-rev remote (server wins)', async () => {
    // local g1 edited (pending, last synced at rev 1); server advanced it to rev 5
    const cur = snapshot([term('g1', 'mine')])
    const revs = new Map([['g1', 1]])
    const pending = new Set(['g1'])
    const out = await syncPull(backendWith({ ok: true, value: { changes: [remoteTerm('g1', 'theirs', 5)], maxRev: 5 } }), 1, cur, revs, pending)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.snapshot.terms).toEqual([term('g1', 'theirs')]) // server-rev-primary: remote wins
      expect(out.conflicts).toHaveLength(1)
      expect(out.conflicts[0]).toMatchObject({ type: 'term', id: 'g1' })
      expect(out.revUpdates).toEqual({ g1: 5 }) // rev map advances to the winning server rev
    }
  })

  it('keeps a pending local edit (and its base rev) when the pull is not newer than its base', async () => {
    // g1 pending at base rev 4; server pull only reaches rev 4 for it → keep the local edit to push later.
    const cur = snapshot([term('g1', 'mine')])
    const revs = new Map([['g1', 4]])
    const pending = new Set(['g1'])
    const out = await syncPull(backendWith({ ok: true, value: { changes: [remoteTerm('g1', 'stale', 4)], maxRev: 4 } }), 4, cur, revs, pending)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.snapshot.terms).toEqual([term('g1', 'mine')]) // local edit retained
      expect(out.conflicts).toEqual([])
      expect(out.revUpdates).toEqual({ g1: 4 }) // unchanged base rev
    }
  })
})

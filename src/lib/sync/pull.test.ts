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
const NO_PENDING: ReadonlyMap<string, number> = new Map()

describe('syncPull', () => {
  it('returns the mapped error when the pull fails (and does not touch local state)', async () => {
    for (const kind of ['unreachable', 'auth', 'badRequest'] as const) {
      const out = await syncPull(backendWith({ ok: false, error: { kind } }), 0, snapshot(), NO_PENDING)
      expect(out).toEqual({ ok: false, error: { kind } })
    }
  })

  it('pulls from the cursor, adopts new remote entities, and advances the cursor', async () => {
    const backend = backendWith({ ok: true, value: { changes: [remoteTerm('g1', 'API', 3)], maxRev: 3 } })
    const out = await syncPull(backend, 0, snapshot(), NO_PENDING)
    expect(backend.pull).toHaveBeenCalledWith(0)
    expect(out).toMatchObject({ ok: true, cursor: 3, conflicts: [] })
    if (out.ok) expect(out.snapshot.terms).toEqual([term('g1', 'API')])
  })

  it('an empty pull is a no-op apply that still advances the cursor', async () => {
    const cur = snapshot([term('g9', 'Keep')])
    const out = await syncPull(backendWith({ ok: true, value: { changes: [], maxRev: 7 } }), 5, cur, NO_PENDING)
    expect(out).toMatchObject({ ok: true, cursor: 7, conflicts: [] })
    if (out.ok) expect(out.snapshot.terms).toEqual([term('g9', 'Keep')]) // unchanged
  })

  it('advances the cursor monotonically — never below the requested cursor (buggy server maxRev < cursor)', async () => {
    const out = await syncPull(backendWith({ ok: true, value: { changes: [], maxRev: 3 } }), 10, snapshot(), NO_PENDING)
    expect(out).toMatchObject({ ok: true, cursor: 10 }) // stays at 10, not 3
  })

  it('advances the cursor to the highest applied rev even if maxRev under-reports it', async () => {
    const backend = backendWith({ ok: true, value: { changes: [remoteTerm('g1', 'API', 9)], maxRev: 3 } })
    const out = await syncPull(backend, 1, snapshot(), NO_PENDING)
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
    const out = await syncPull(backendWith({ ok: true, value: { changes, maxRev: 1 } }), 0, snapshot(), NO_PENDING)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.cursor).toBe(N) // max(0, 1, 1..N) = N
  })

  it('records a conflict when a pending local edit is superseded by a higher-rev remote (server wins)', async () => {
    // local g1 edited (pending at baseRev 1); server advanced it to rev 5
    const cur = snapshot([term('g1', 'mine')])
    const pending = new Map([['g1', 1]])
    const out = await syncPull(backendWith({ ok: true, value: { changes: [remoteTerm('g1', 'theirs', 5)], maxRev: 5 } }), 1, cur, pending)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.snapshot.terms).toEqual([term('g1', 'theirs')]) // server-rev-primary: remote wins
      expect(out.conflicts).toHaveLength(1)
      expect(out.conflicts[0]).toMatchObject({ type: 'term', id: 'g1' })
    }
  })
})

import { describe, it, expect, vi } from 'vitest'
import { runCycle } from './cycle'
import { enqueue, emptyQueue } from './queue'
import type { PushQueue } from './queue'
import type { SyncBackend, BackendResult } from './backend'
import type { PullResult, PushResult, PushOp, SyncEntity } from './types'
import type { Term } from '@/stores/glossaryStore'

const term = (id: string, label: string): Term => ({ id, label, createdAt: 1, updatedAt: 1, deletedAt: null })
// The SyncEntity shape a term takes once flattened — same for a local-kept term and a pulled remote.
const termEntity = (id: string, label: string, rev: number): SyncEntity => ({
  type: 'term',
  id,
  payload: { label, createdAt: 1 },
  updatedAt: 1,
  deletedAt: null,
  rev,
})
const termOp = (id: string, baseRev = 0): PushOp => ({
  type: 'term',
  id,
  payload: { label: 'mine', createdAt: 1 },
  updatedAt: 1,
  deletedAt: null,
  baseRev,
})

const snap = (terms: Term[] = []) => ({ sessions: [], terms, keywords: [], starred: [] })
const queueOf = (...ops: PushOp[]): PushQueue => ops.reduce((q, o) => enqueue(q, o), emptyQueue())

// A backend with a fixed pull + push result; purge is unused by runCycle.
const backend = (pull: BackendResult<PullResult>, push: BackendResult<PushResult[]>): SyncBackend => ({
  pull: vi.fn(() => Promise.resolve(pull)),
  push: vi.fn(() => Promise.resolve(push)),
  purge: vi.fn(),
})

describe('runCycle', () => {
  it('aborts on a pull failure and never pushes (the pull is idempotent, nothing committed)', async () => {
    const be = backend({ ok: false, error: { kind: 'unreachable' } }, { ok: true, value: [] })
    const out = await runCycle(be, { cursor: 0, revs: new Map(), snapshot: snap(), queue: emptyQueue() })
    expect(out).toEqual({ ok: false, error: { kind: 'unreachable' } })
    expect(be.push).not.toHaveBeenCalled()
  })

  it('a clean empty cycle (nothing pending, nothing pulled) advances the cursor and stays idle', async () => {
    const be = backend({ ok: true, value: { changes: [], maxRev: 4 } }, { ok: true, value: [] })
    const out = await runCycle(be, { cursor: 4, revs: new Map(), snapshot: snap([term('g1', 'API')]), queue: emptyQueue() })
    expect(be.push).not.toHaveBeenCalled() // nothing to push → no backend round-trip
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.cursor).toBe(4)
      expect(out.apply).toEqual([termEntity('g1', 'API', 0)]) // local-kept, applied as a no-op
      expect(out.conflicts).toEqual([])
      expect(out.queue.size).toBe(0)
      expect(out.status).toBe('idle')
    }
  })

  it('adopts a new remote entity from the pull and reports its rev', async () => {
    const be = backend({ ok: true, value: { changes: [termEntity('g2', 'New', 3)], maxRev: 3 } }, { ok: true, value: [] })
    const out = await runCycle(be, { cursor: 0, revs: new Map(), snapshot: snap(), queue: emptyQueue() })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.apply).toEqual([termEntity('g2', 'New', 3)])
      expect(out.revUpdates).toEqual({ g2: 3 })
      expect(out.status).toBe('idle')
    }
  })

  it('pushes a pending edit, records the applied rev, and acks it off the queue', async () => {
    const be = backend({ ok: true, value: { changes: [], maxRev: 1 } }, { ok: true, value: [{ status: 'applied', id: 'g1', rev: 5 }] })
    const out = await runCycle(be, { cursor: 1, revs: new Map(), snapshot: snap([term('g1', 'mine')]), queue: queueOf(termOp('g1', 0)) })
    expect(be.push).toHaveBeenCalledWith([termOp('g1', 0)])
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.revUpdates.g1).toBe(5) // push rev overrides the pull's local-kept view
      expect(out.apply).toEqual([termEntity('g1', 'mine', 0)]) // not dirty after ack → still applied
      expect(out.queue.size).toBe(0)
      expect(out.conflicts).toEqual([])
      expect(out.status).toBe('idle')
    }
  })

  it('does NOT re-push an edit the pull already superseded (server won) — surfaces the conflict', async () => {
    const be = backend({ ok: true, value: { changes: [termEntity('g1', 'theirs', 9)], maxRev: 9 } }, { ok: true, value: [] })
    const out = await runCycle(be, { cursor: 1, revs: new Map([['g1', 1]]), snapshot: snap([term('g1', 'mine')]), queue: queueOf(termOp('g1', 1)) })
    expect(be.push).not.toHaveBeenCalled() // only superseded entry was pending → nothing left to push
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.apply).toEqual([termEntity('g1', 'theirs', 9)]) // server value to commit
      expect(out.revUpdates.g1).toBe(9)
      expect(out.conflicts).toHaveLength(1)
      expect(out.conflicts[0]).toMatchObject({ id: 'g1' })
      expect(out.queue.size).toBe(0) // superseded entry acked away
      expect(out.status).toBe('conflict')
    }
  })

  it('surfaces a push conflict (a server change racing between our pull and push) and advances the rev', async () => {
    const srv = termEntity('g1', 'server-newer', 9)
    const be = backend({ ok: true, value: { changes: [], maxRev: 4 } }, { ok: true, value: [{ status: 'conflict', id: 'g1', server: srv }] })
    const out = await runCycle(be, { cursor: 4, revs: new Map([['g1', 4]]), snapshot: snap([term('g1', 'mine')]), queue: queueOf(termOp('g1', 4)) })
    expect(be.push).toHaveBeenCalled()
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.revUpdates.g1).toBe(9)
      expect(out.apply).toEqual([srv]) // the server winner is committed (not left as the losing local value)
      expect(out.conflicts).toHaveLength(1)
      expect(out.conflicts[0]).toMatchObject({ id: 'g1', server: srv })
      expect(out.queue.size).toBe(0)
      expect(out.status).toBe('conflict')
    }
  })

  it('aborts when the push fails after a successful pull (discards the idempotent pull, queue intact)', async () => {
    const out = await runCycle(
      backend({ ok: true, value: { changes: [], maxRev: 1 } }, { ok: false, error: { kind: 'auth' } }),
      { cursor: 1, revs: new Map(), snapshot: snap([term('g1', 'mine')]), queue: queueOf(termOp('g1', 0)) },
    )
    expect(out).toEqual({ ok: false, error: { kind: 'auth' } })
  })

  it('ack-gates an APPLIED rev AND excludes the id from apply when a mid-push re-edit bumps its seq', async () => {
    const startQ = queueOf(termOp('g1', 3)) // seq 1, base rev 3
    const liveQ = enqueue(startQ, termOp('g1', 3)) // seq 2 — user re-edited DURING the push
    const be = backend({ ok: true, value: { changes: [], maxRev: 3 } }, { ok: true, value: [{ status: 'applied', id: 'g1', rev: 7 }] })
    const out = await runCycle(be, {
      cursor: 3,
      revs: new Map([['g1', 3]]),
      snapshot: snap([term('g1', 'mine')]),
      queue: startQ,
      liveQueue: () => liveQ,
    })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.revUpdates.g1).toBe(3) // gated: stays at the pending edit's baseRev, NOT bumped to 7
      expect(out.apply).toEqual([]) // g1 still dirty → EXCLUDED so the commit can't clobber the re-edit
      expect(out.queue.get('g1')?.seq).toBe(2) // the newer edit is preserved
      expect(out.status).toBe('idle')
    }
  })

  it('ack-gates a CONFLICT AND excludes the id from apply when a mid-push re-edit bumps its seq', async () => {
    const startQ = queueOf(termOp('g1', 3))
    const liveQ = enqueue(startQ, termOp('g1', 3)) // seq 2
    const be = backend(
      { ok: true, value: { changes: [], maxRev: 3 } },
      { ok: true, value: [{ status: 'conflict', id: 'g1', server: termEntity('g1', 'theirs', 9) }] },
    )
    const out = await runCycle(be, {
      cursor: 3,
      revs: new Map([['g1', 3]]),
      snapshot: snap([term('g1', 'mine')]),
      queue: startQ,
      liveQueue: () => liveQ,
    })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.conflicts).toEqual([]) // not surfaced over the newer local edit
      expect(out.revUpdates.g1).toBe(3) // not bumped to the server rev
      expect(out.apply).toEqual([]) // g1 still dirty → excluded from the commit
      expect(out.queue.get('g1')?.seq).toBe(2)
      expect(out.status).toBe('idle')
    }
  })

  it('a NON-pending entity first-edited mid-cycle is excluded from apply AND its rev is not advanced', async () => {
    // g9 is clean at cycle start; the server changed it (pull) AND the user first-edits it DURING the
    // cycle (a new live-queue entry at baseRev 0). The pulled value must NOT clobber the live edit, and
    // revUpdates must NOT advance g9 to the pulled rev (would break the pending-id == baseRev invariant).
    const startQ = emptyQueue()
    const liveQ = enqueue(startQ, termOp('g9', 0)) // user's brand-new edit, mid-cycle
    const be = backend({ ok: true, value: { changes: [termEntity('g9', 'server', 5)], maxRev: 5 } }, { ok: true, value: [] })
    const out = await runCycle(be, { cursor: 0, revs: new Map(), snapshot: snap(), queue: startQ, liveQueue: () => liveQ })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.apply).toEqual([]) // g9 is dirty in the live queue → excluded, live edit preserved
      expect(out.revUpdates.g9).toBe(0) // pinned to the queued baseRev, NOT advanced to the pulled rev 5
      expect(out.queue.get('g9')?.seq).toBe(1) // the mid-cycle edit stays queued to push next cycle
      expect(out.status).toBe('idle')
    }
  })

  it('a pull-superseded edit re-edited mid-cycle does NOT surface the stale conflict or advance the rev', async () => {
    // g1 pending at base 1; the pull supersedes it (server @9) → a pull conflict for the OLD edit. But
    // the user re-edits g1 DURING the cycle (seq 2 survives ack). The stale conflict for the superseded
    // OLD edit must not be surfaced, the server value must not clobber the live re-edit, and the rev
    // must stay at the surviving op's baseRev.
    const startQ = queueOf(termOp('g1', 1)) // seq 1, base 1
    const liveQ = enqueue(startQ, termOp('g1', 1)) // seq 2 — re-edited mid-cycle
    const be = backend({ ok: true, value: { changes: [termEntity('g1', 'theirs', 9)], maxRev: 9 } }, { ok: true, value: [] })
    const out = await runCycle(be, { cursor: 1, revs: new Map([['g1', 1]]), snapshot: snap([term('g1', 'mine')]), queue: startQ, liveQueue: () => liveQ })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.conflicts).toEqual([]) // stale pull conflict for the superseded OLD edit is dropped
      expect(out.apply).toEqual([]) // server value not committed over the live re-edit
      expect(out.revUpdates.g1).toBe(1) // pinned to the surviving op's baseRev, NOT advanced to 9
      expect(out.queue.get('g1')?.seq).toBe(2)
      expect(out.status).toBe('idle')
    }
  })

  it('combines a pulled remote adopt with a pushed applied edit in one cycle', async () => {
    const be = backend(
      { ok: true, value: { changes: [termEntity('g2', 'New', 3)], maxRev: 3 } },
      { ok: true, value: [{ status: 'applied', id: 'g1', rev: 5 }] },
    )
    const out = await runCycle(be, { cursor: 0, revs: new Map(), snapshot: snap([term('g1', 'mine')]), queue: queueOf(termOp('g1', 0)) })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.apply.map((e) => e.id).sort()).toEqual(['g1', 'g2'])
      expect(out.revUpdates).toMatchObject({ g1: 5, g2: 3 })
      expect(out.queue.size).toBe(0)
      expect(out.status).toBe('idle')
    }
  })
})

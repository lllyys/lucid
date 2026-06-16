import { describe, it, expect } from 'vitest'
import { emptyQueue, enqueue, pending, ack } from './queue'
import type { PushOp } from './types'

const op = (id: string, payload: Record<string, unknown> = {}): PushOp => ({
  type: 'term',
  id,
  payload,
  updatedAt: 1,
  deletedAt: null,
  baseRev: 0,
})

describe('push queue (pure)', () => {
  it('an empty queue has no pending ops', () => {
    expect(pending(emptyQueue())).toEqual([])
  })

  it('enqueue adds an entry at seq 1', () => {
    const q = enqueue(emptyQueue(), op('a'))
    expect(pending(q)).toEqual([{ op: op('a'), seq: 1 }])
  })

  it('enqueueing the same id collapses to ONE entry with the latest op and a bumped seq', () => {
    let q = enqueue(emptyQueue(), op('a', { v: 1 }))
    q = enqueue(q, op('a', { v: 2 }))
    const p = pending(q)
    expect(p).toHaveLength(1)
    expect(p[0]).toEqual({ op: op('a', { v: 2 }), seq: 2 }) // latest op wins; seq bumped 1→2
  })

  it('keeps distinct ids as separate entries', () => {
    let q = enqueue(emptyQueue(), op('a'))
    q = enqueue(q, op('b'))
    expect(pending(q).map((e) => e.op.id).sort()).toEqual(['a', 'b'])
  })

  it('ack removes an entry whose (id, seq) is unchanged since the snapshot', () => {
    const q = enqueue(emptyQueue(), op('a'))
    const snapshot = pending(q)
    expect(pending(ack(q, snapshot))).toEqual([]) // pushed + acked → gone
  })

  it('ack KEEPS an entry that was superseded by a newer enqueue during the in-flight push (no lost edit)', () => {
    const q1 = enqueue(emptyQueue(), op('a', { v: 1 }))
    const snapshot = pending(q1) // seq 1, captured before the in-flight push
    const q2 = enqueue(q1, op('a', { v: 2 })) // a mid-flight edit bumps to seq 2
    const after = ack(q2, snapshot) // ack the seq-1 snapshot
    const p = pending(after)
    expect(p).toHaveLength(1)
    expect(p[0]).toEqual({ op: op('a', { v: 2 }), seq: 2 }) // the mid-flight edit survives
  })

  it('ack is a no-op for an id that is no longer queued', () => {
    const q = enqueue(emptyQueue(), op('a'))
    const staleSnapshot = [{ op: op('gone'), seq: 1 }]
    expect(pending(ack(q, staleSnapshot)).map((e) => e.op.id)).toEqual(['a'])
  })

  it('enqueue and ack do not mutate the input queue (immutable)', () => {
    const q0 = emptyQueue()
    const q1 = enqueue(q0, op('a'))
    expect(pending(q0)).toEqual([]) // q0 untouched
    const q2 = ack(q1, pending(q1))
    expect(pending(q1)).toHaveLength(1) // q1 untouched
    expect(pending(q2)).toEqual([])
  })
})

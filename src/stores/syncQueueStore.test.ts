import { describe, it, expect, beforeEach } from 'vitest'
import { useSyncQueueStore, sanitizeQueueEntries, partializeSyncQueue, mergeSyncQueue } from './syncQueueStore'
import type { PushOp } from '@/lib/sync/types'
import type { QueueEntry } from '@/lib/sync/queue'

const op = (id: string, baseRev = 0): PushOp => ({ type: 'term', id, payload: { label: id, createdAt: 1 }, updatedAt: 1, deletedAt: null, baseRev })

beforeEach(() => {
  useSyncQueueStore.getState().reset()
})

describe('syncQueueStore', () => {
  it('starts empty', () => {
    expect(useSyncQueueStore.getState().entries).toEqual([])
  })

  it('enqueue appends an entry at seq 1', () => {
    useSyncQueueStore.getState().enqueue(op('a'))
    const { entries } = useSyncQueueStore.getState()
    expect(entries).toEqual([{ op: op('a'), seq: 1 }])
  })

  it('enqueue collapses a rapid same-id edit to the latest op with a bumped seq', () => {
    useSyncQueueStore.getState().enqueue(op('a', 0))
    useSyncQueueStore.getState().enqueue(op('a', 3)) // re-edit of the same id
    const { entries } = useSyncQueueStore.getState()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({ op: op('a', 3), seq: 2 }) // latest op, seq bumped
  })

  it('enqueue keeps distinct ids as separate entries (insertion order)', () => {
    useSyncQueueStore.getState().enqueue(op('a'))
    useSyncQueueStore.getState().enqueue(op('b'))
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['a', 'b'])
  })

  it('ack drops an acked entry whose seq is unchanged, keeping the others', () => {
    useSyncQueueStore.getState().enqueue(op('a'))
    useSyncQueueStore.getState().enqueue(op('b'))
    const snapshot: QueueEntry[] = [{ op: op('a'), seq: 1 }]
    useSyncQueueStore.getState().ack(snapshot)
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['b'])
  })

  it('ack keeps an entry re-edited after the snapshot (seq bumped → not dropped)', () => {
    useSyncQueueStore.getState().enqueue(op('a', 0)) // seq 1
    const snapshot: QueueEntry[] = [{ op: op('a', 0), seq: 1 }] // what we pushed
    useSyncQueueStore.getState().enqueue(op('a', 0)) // mid-flight re-edit → seq 2
    useSyncQueueStore.getState().ack(snapshot)
    const { entries } = useSyncQueueStore.getState()
    expect(entries).toHaveLength(1)
    expect(entries[0].seq).toBe(2) // the newer edit survives
  })

  it('reset clears the queue', () => {
    useSyncQueueStore.getState().enqueue(op('a'))
    useSyncQueueStore.getState().reset()
    expect(useSyncQueueStore.getState().entries).toEqual([])
  })
})

describe('syncQueueStore persist helpers', () => {
  it('sanitizeQueueEntries keeps well-formed entries', () => {
    const entries: QueueEntry[] = [
      { op: op('a'), seq: 1 },
      { op: op('b', 5), seq: 3 },
    ]
    expect(sanitizeQueueEntries({ entries })).toEqual(entries)
  })

  it('sanitizeQueueEntries returns [] for a non-object or a non-array entries field', () => {
    expect(sanitizeQueueEntries(null)).toEqual([])
    expect(sanitizeQueueEntries(42)).toEqual([])
    expect(sanitizeQueueEntries({ entries: 'nope' })).toEqual([])
  })

  it('sanitizeQueueEntries drops malformed entries and, on a duplicate id, keeps the highest-seq op', () => {
    const dirty = {
      entries: [
        { op: op('a', 0), seq: 1 }, // first sight of 'a'
        { op: { ...op('b'), baseRev: -1 }, seq: 1 }, // bad baseRev → dropped
        { op: op('c'), seq: 1.5 }, // fractional seq → dropped
        { op: op('c'), seq: 'x' }, // bad seq → dropped
        { seq: 1 }, // missing op → dropped
        { op: op('a', 5), seq: 9 }, // duplicate id, HIGHER seq → replaces (freshest edit wins)
        { op: op('a', 0), seq: 2 }, // duplicate id, LOWER seq → ignored (existing seq 9 kept)
      ],
    }
    expect(sanitizeQueueEntries(dirty)).toEqual([{ op: op('a', 5), seq: 9 }])
  })

  it('partializeSyncQueue persists ONLY the entries', () => {
    useSyncQueueStore.getState().enqueue(op('a'))
    const persisted = partializeSyncQueue(useSyncQueueStore.getState())
    expect(Object.keys(persisted)).toEqual(['entries'])
    expect(persisted.entries).toEqual([{ op: op('a'), seq: 1 }])
  })

  it('mergeSyncQueue sanitizes the persisted entries while preserving the live actions', () => {
    const current = useSyncQueueStore.getState()
    const merged = mergeSyncQueue({ entries: [{ op: op('a'), seq: 1 }, { bad: true }] }, current)
    expect(merged.entries).toEqual([{ op: op('a'), seq: 1 }]) // garbage dropped
    expect(typeof merged.enqueue).toBe('function') // actions preserved
    expect(typeof merged.ack).toBe('function')
  })
})

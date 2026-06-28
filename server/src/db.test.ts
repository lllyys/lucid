// WI-8b — SQLite sync store (createSyncStore): apply-ops decision table, changesSince cursor, purge.
import { afterEach, describe, expect, it } from 'vitest'
import { createSyncStore, type SyncStore } from './db.js'
import type { PushOp } from './types.js'

let store: SyncStore

afterEach(() => {
  store.close()
})

/** Build a PushOp with sensible defaults; override per test. */
function op(over: Partial<PushOp> = {}): PushOp {
  return {
    type: 'session',
    id: 'a',
    payload: { text: 'hello' },
    updatedAt: 1000,
    deletedAt: null,
    baseRev: 0,
    ...over,
  }
}

describe('createSyncStore.applyOps — decision table', () => {
  it('creates a new entity (baseRev 0) → applied at rev 1, visible in changesSince(0)', () => {
    store = createSyncStore()
    const results = store.applyOps([op({ id: 'a', payload: { v: 1 } })])

    expect(results).toEqual([{ status: 'applied', id: 'a', rev: 1 }])

    const pull = store.changesSince(0)
    expect(pull.maxRev).toBe(1)
    expect(pull.changes).toHaveLength(1)
    expect(pull.changes[0]).toMatchObject({
      type: 'session',
      id: 'a',
      payload: { v: 1 },
      updatedAt: 1000,
      deletedAt: null,
      rev: 1,
    })
  })

  it('updates an existing entity at the matching baseRev → applied, rev increments', () => {
    store = createSyncStore()
    const r1 = store.applyOps([op({ id: 'a', payload: { v: 1 }, baseRev: 0 })])
    expect(r1[0]).toEqual({ status: 'applied', id: 'a', rev: 1 })

    const r2 = store.applyOps([op({ id: 'a', payload: { v: 2 }, baseRev: 1 })])
    expect(r2[0]).toEqual({ status: 'applied', id: 'a', rev: 2 })

    const r3 = store.applyOps([op({ id: 'a', payload: { v: 3 }, baseRev: 2 })])
    expect(r3[0]).toEqual({ status: 'applied', id: 'a', rev: 3 })

    const pull = store.changesSince(0)
    expect(pull.changes).toHaveLength(1)
    expect(pull.changes[0]).toMatchObject({ id: 'a', payload: { v: 3 }, rev: 3 })
  })

  it('baseRev mismatch on an existing row → conflict with the current server entity, row unchanged', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 'a', payload: { v: 1 }, baseRev: 0 })]) // rev 1
    store.applyOps([op({ id: 'a', payload: { v: 2 }, baseRev: 1 })]) // rev 2

    // Client thinks it is still at rev 1; server is at rev 2.
    const r = store.applyOps([op({ id: 'a', payload: { vStale: true }, baseRev: 1 })])
    expect(r).toHaveLength(1)
    const result = r[0]!
    expect(result.status).toBe('conflict')
    if (result.status !== 'conflict') throw new Error('expected conflict')
    expect(result.id).toBe('a')
    expect(result.server).toMatchObject({ id: 'a', payload: { v: 2 }, rev: 2 })

    // Row unchanged: still rev 2 with payload v:2, not the stale push.
    const pull = store.changesSince(0)
    expect(pull.changes).toHaveLength(1)
    expect(pull.changes[0]).toMatchObject({ id: 'a', payload: { v: 2 }, rev: 2 })
  })

  it('expect-new (baseRev 0) when a row already exists → conflict (server returned)', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 'a', payload: { v: 1 }, baseRev: 0 })]) // rev 1

    const r = store.applyOps([op({ id: 'a', payload: { vDup: true }, baseRev: 0 })])
    const result = r[0]!
    expect(result.status).toBe('conflict')
    if (result.status !== 'conflict') throw new Error('expected conflict')
    expect(result.server).toMatchObject({ id: 'a', payload: { v: 1 }, rev: 1 })

    const pull = store.changesSince(0)
    expect(pull.changes[0]).toMatchObject({ payload: { v: 1 }, rev: 1 })
  })

  it('baseRev>0 when NO row exists → APPLIED (create), does not conflict against a nonexistent entity', () => {
    store = createSyncStore()
    // e.g. after a purge: client still holds baseRev 5 but the server has no row.
    const r = store.applyOps([op({ id: 'ghost', payload: { v: 9 }, baseRev: 5 })])
    expect(r).toEqual([{ status: 'applied', id: 'ghost', rev: 1 }])

    const pull = store.changesSince(0)
    expect(pull.changes).toHaveLength(1)
    expect(pull.changes[0]).toMatchObject({ id: 'ghost', payload: { v: 9 }, rev: 1 })
  })

  it('a tombstone op (deletedAt set) → stored with deletedAt, returned by changesSince intact', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 'a', payload: { v: 1 }, baseRev: 0 })]) // rev 1, live

    const r = store.applyOps([op({ id: 'a', payload: { v: 1 }, deletedAt: 4242, baseRev: 1 })])
    expect(r[0]).toEqual({ status: 'applied', id: 'a', rev: 2 })

    const pull = store.changesSince(0)
    expect(pull.changes).toHaveLength(1)
    expect(pull.changes[0]).toMatchObject({ id: 'a', deletedAt: 4242, rev: 2 })
  })

  it('mixed batch (some applied, some conflict) → one result per op, by id, in order', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 'exists', payload: { v: 1 }, baseRev: 0 })]) // rev 1

    const batch: PushOp[] = [
      op({ id: 'new1', payload: { v: 1 }, baseRev: 0 }), // applied (create)
      op({ id: 'exists', payload: { v: 99 }, baseRev: 0 }), // conflict (expect-new, exists)
      op({ id: 'new2', payload: { v: 2 }, baseRev: 0 }), // applied (create)
    ]
    const r = store.applyOps(batch)
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({ status: 'applied', id: 'new1', rev: 2 })
    expect(r[1]!.status).toBe('conflict')
    expect(r[1]!.id).toBe('exists')
    expect(r[2]).toEqual({ status: 'applied', id: 'new2', rev: 3 })
  })

  it('atomic rev across a batch: 3 new entities in one applyOps yield revs 1,2,3', () => {
    store = createSyncStore()
    const r = store.applyOps([
      op({ id: 'a', baseRev: 0 }),
      op({ id: 'b', baseRev: 0 }),
      op({ id: 'c', baseRev: 0 }),
    ])
    expect(r).toEqual([
      { status: 'applied', id: 'a', rev: 1 },
      { status: 'applied', id: 'b', rev: 2 },
      { status: 'applied', id: 'c', rev: 3 },
    ])
    expect(store.changesSince(0).maxRev).toBe(3)
  })

  it('an empty batch yields an empty result set and does not change state', () => {
    store = createSyncStore()
    expect(store.applyOps([])).toEqual([])
    expect(store.changesSince(0)).toEqual({ changes: [], maxRev: 0 })
  })
})

describe('createSyncStore.applyOps — input validation (untrusted server boundary)', () => {
  // The store must never PERSIST a value that would later fail the client's isSyncEntity guard when
  // re-emitted on the conflict path (which would mismap a real conflict to badRequest). A malformed op
  // rejects the whole batch by throwing BEFORE the transaction (the HTTP layer maps the throw to 400).
  it.each([
    { desc: 'negative updatedAt', over: { updatedAt: -1 } },
    { desc: 'fractional updatedAt', over: { updatedAt: 0.5 } },
    { desc: 'negative deletedAt', over: { deletedAt: -5 } },
    { desc: 'fractional deletedAt', over: { deletedAt: 1.5 } },
    { desc: 'negative baseRev', over: { baseRev: -1 } },
    { desc: 'unknown type', over: { type: 'nope' as PushOp['type'] } },
    { desc: 'array payload', over: { payload: [] as unknown as Record<string, unknown> } },
    { desc: 'null payload', over: { payload: null as unknown as Record<string, unknown> } },
  ])('throws on $desc and stores nothing', ({ over }) => {
    store = createSyncStore()
    expect(() => store.applyOps([op(over)])).toThrow()
    expect(store.changesSince(0)).toEqual({ changes: [], maxRev: 0 }) // batch rejected, nothing persisted
  })

  it('accepts a starred op (feature #22 — now a valid type) → applied + round-trips with a server rev', () => {
    store = createSyncStore()
    const r = store.applyOps([op({ id: 'st1', type: 'starred', payload: { kind: 'word', source: 'cat' } })])
    expect(r).toEqual([{ status: 'applied', id: 'st1', rev: 1 }])
    const pull = store.changesSince(0)
    expect(pull.changes[0]).toMatchObject({ type: 'starred', id: 'st1', payload: { kind: 'word', source: 'cat' }, rev: 1 })
  })

  it('accepts the boundary values updatedAt 0 and deletedAt 0 (isNonNegInt(0) is valid)', () => {
    store = createSyncStore()
    const r = store.applyOps([op({ id: 'z', updatedAt: 0, deletedAt: 0, baseRev: 0 })])
    expect(r).toEqual([{ status: 'applied', id: 'z', rev: 1 }])
    expect(store.changesSince(0).changes[0]).toMatchObject({ updatedAt: 0, deletedAt: 0 })
  })

  it('one malformed op rejects the WHOLE batch atomically — valid ops before it are not stored', () => {
    store = createSyncStore()
    expect(() =>
      store.applyOps([
        op({ id: 'good', baseRev: 0 }), // valid
        op({ id: 'bad', updatedAt: -1, baseRev: 0 }), // malformed → rejects the batch
      ]),
    ).toThrow()
    expect(store.changesSince(0)).toEqual({ changes: [], maxRev: 0 }) // 'good' was NOT persisted
  })
})

describe('createSyncStore.changesSince — cursor semantics', () => {
  it('filters strictly by rev>since and reports the correct maxRev', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 'a', baseRev: 0 })]) // rev 1
    store.applyOps([op({ id: 'b', baseRev: 0 })]) // rev 2
    store.applyOps([op({ id: 'c', baseRev: 0 })]) // rev 3

    const sinceAll = store.changesSince(0)
    expect(sinceAll.changes.map((c) => c.rev)).toEqual([1, 2, 3])
    expect(sinceAll.maxRev).toBe(3)

    const sinceMid = store.changesSince(1)
    expect(sinceMid.changes.map((c) => c.id)).toEqual(['b', 'c'])
    expect(sinceMid.maxRev).toBe(3)

    const sinceTop = store.changesSince(3)
    expect(sinceTop.changes).toEqual([])
    expect(sinceTop.maxRev).toBe(3) // MAX(rev) over all rows, even when nothing is newer
  })

  it('orders changes by rev ASC', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 'a', baseRev: 0 })]) // rev 1
    store.applyOps([op({ id: 'b', baseRev: 0 })]) // rev 2
    store.applyOps([op({ id: 'a', payload: { v: 2 }, baseRev: 1 })]) // rev 3 (a moves to the end)

    const pull = store.changesSince(0)
    expect(pull.changes.map((c) => c.id)).toEqual(['b', 'a'])
    expect(pull.changes.map((c) => c.rev)).toEqual([2, 3])
  })

  it('empty table → maxRev equals since (never reports a maxRev below the requested cursor)', () => {
    store = createSyncStore()
    expect(store.changesSince(0)).toEqual({ changes: [], maxRev: 0 })
    expect(store.changesSince(7)).toEqual({ changes: [], maxRev: 7 })
  })
})

describe('createSyncStore.purge', () => {
  it('empties the store (changesSince(0).changes === [])', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 'a', baseRev: 0 })])
    store.applyOps([op({ id: 'b', baseRev: 0 })])
    expect(store.changesSince(0).changes).toHaveLength(2)

    store.purge()
    expect(store.changesSince(0).changes).toEqual([])
    expect(store.changesSince(0).maxRev).toBe(0)
  })

  it('after purge, a fresh create starts rev allocation at 1 again', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 'a', baseRev: 0 })]) // rev 1
    store.applyOps([op({ id: 'b', baseRev: 0 })]) // rev 2
    store.purge()

    const r = store.applyOps([op({ id: 'c', baseRev: 0 })])
    expect(r).toEqual([{ status: 'applied', id: 'c', rev: 1 }])
  })
})

describe('createSyncStore — payload fidelity', () => {
  it('round-trips a nested object intact through JSON', () => {
    store = createSyncStore()
    const payload = {
      nested: { a: [1, 2, { deep: true }], b: null },
      flag: false,
      count: 0,
    }
    store.applyOps([op({ id: 'x', payload, baseRev: 0 })])
    expect(store.changesSince(0).changes[0]!.payload).toEqual(payload)
  })

  it('round-trips unicode / CJK / emoji intact', () => {
    store = createSyncStore()
    const payload = { text: '你好 — café 🌍 مرحبا', list: ['日本語', '🚀'] }
    store.applyOps([op({ id: 'u', payload, baseRev: 0 })])
    expect(store.changesSince(0).changes[0]!.payload).toEqual(payload)
  })

  it('preserves the entity type across the round-trip', () => {
    store = createSyncStore()
    store.applyOps([op({ id: 't', type: 'task', payload: { sessionId: 's1' }, baseRev: 0 })])
    expect(store.changesSince(0).changes[0]!.type).toBe('task')
  })
})

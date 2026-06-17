import { describe, it, expect, vi } from 'vitest'
import { syncPush } from './push'
import type { SyncBackend, BackendResult } from './backend'
import type { PushOp, PushResult, SyncEntity } from './types'
import type { QueueEntry } from './queue'

const op = (id: string, baseRev = 0): PushOp => ({ type: 'term', id, payload: { label: 'x', createdAt: 1 }, updatedAt: 1, deletedAt: null, baseRev })
const entry = (id: string, seq = 1, baseRev = 0): QueueEntry => ({ op: op(id, baseRev), seq })
const serverEntity = (id: string, rev: number): SyncEntity => ({ type: 'term', id, payload: { label: 'theirs', createdAt: 1 }, updatedAt: 2, deletedAt: null, rev })

const backendWith = (result: BackendResult<PushResult[]>): SyncBackend => ({
  pull: vi.fn(),
  push: vi.fn(() => Promise.resolve(result)),
  purge: vi.fn(),
})

describe('syncPush', () => {
  it('does not call the backend for an empty queue', async () => {
    const backend = backendWith({ ok: true, value: [] })
    const out = await syncPush(backend, [])
    expect(backend.push).not.toHaveBeenCalled()
    expect(out).toEqual({ ok: true, pushed: [] })
  })

  it('returns the mapped error on a transport failure (nothing pushed)', async () => {
    const out = await syncPush(backendWith({ ok: false, error: { kind: 'unreachable' } }), [entry('a')])
    expect(out).toEqual({ ok: false, error: { kind: 'unreachable' } })
  })

  it('reports each applied op with its NEW server rev (the entity’s next baseRev), tied to its entry', async () => {
    const entries = [entry('a'), entry('b')]
    const backend = backendWith({ ok: true, value: [
      { status: 'applied', id: 'a', rev: 4 },
      { status: 'applied', id: 'b', rev: 5 },
    ] })
    const out = await syncPush(backend, entries)
    expect(backend.push).toHaveBeenCalledWith([op('a'), op('b')])
    if (out.ok) {
      expect(out.pushed).toEqual([
        { entry: entries[0], status: 'applied', rev: 4 },
        { entry: entries[1], status: 'applied', rev: 5 },
      ])
    }
  })

  it('on a conflict: reports it tied to its entry, with local (the pushed op @ baseRev) + server', async () => {
    const e = entry('a', 1, /*baseRev*/ 2)
    const srv = serverEntity('a', 9)
    const out = await syncPush(backendWith({ ok: true, value: [{ status: 'conflict', id: 'a', server: srv }] }), [e])
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.pushed).toHaveLength(1)
      const p = out.pushed[0]
      expect(p.entry).toBe(e) // tied to the entry → orchestrator can ack-gate (apply only if still queued)
      expect(p.status).toBe('conflict')
      if (p.status === 'conflict') {
        expect(p.conflict).toMatchObject({ type: 'term', id: 'a', server: srv })
        expect(p.conflict.local).toMatchObject({ id: 'a', rev: 2 }) // the op we tried to push (rev = its baseRev)
      }
    }
  })

  it('handles a mixed applied + conflict batch', async () => {
    const entries = [entry('a'), entry('b')]
    const srv = serverEntity('b', 9)
    const out = await syncPush(backendWith({ ok: true, value: [
      { status: 'applied', id: 'a', rev: 4 },
      { status: 'conflict', id: 'b', server: srv },
    ] }), entries)
    if (out.ok) {
      expect(out.pushed.map((p) => [p.entry.op.id, p.status])).toEqual([['a', 'applied'], ['b', 'conflict']])
    }
  })

  it('skips an entry with no matching result (defensive — a backend that violates the 1:1 contract); it stays queued', async () => {
    const entries = [entry('a'), entry('b')]
    // backend returns a result only for 'a'
    const out = await syncPush(backendWith({ ok: true, value: [{ status: 'applied', id: 'a', rev: 4 }] }), entries)
    if (out.ok) expect(out.pushed.map((p) => p.entry.op.id)).toEqual(['a']) // 'b' not reported → re-pushed next cycle
  })
})

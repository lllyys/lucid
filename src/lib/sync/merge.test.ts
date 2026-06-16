import { describe, it, expect } from 'vitest'
import { mergeEntities } from './merge'
import type { SyncEntity } from './types'

// Compact fixture builder. `rev` is the server-assigned revision (ordering authority); `up` is the
// client updatedAt metadata; `del` is the tombstone.
const ent = (id: string, rev: number, payload: Record<string, unknown>, up = 1, del: number | null = null): SyncEntity => ({
  type: 'term',
  id,
  payload,
  updatedAt: up,
  deletedAt: del,
  rev,
})
const NONE: ReadonlySet<string> = new Set()
const pending = (...ids: string[]): ReadonlySet<string> => new Set(ids)

describe('mergeEntities', () => {
  it('keeps a local-only entity (not present in the remote pull)', () => {
    const local = [ent('a', 0, { v: 'local-new' })] // unsynced-new (rev 0)
    const { resolved, conflicts } = mergeEntities(local, [], pending('a'))
    expect(resolved).toEqual(local)
    expect(conflicts).toEqual([])
  })

  it('adopts a remote-only entity (new from the server)', () => {
    const remote = [ent('b', 5, { v: 'from-server' })]
    const { resolved, conflicts } = mergeEntities([], remote, NONE)
    expect(resolved).toEqual(remote)
    expect(conflicts).toEqual([])
  })

  it('adopts the remote when local is NOT pending (server is authoritative)', () => {
    const local = [ent('a', 2, { v: 'old' })]
    const remote = [ent('a', 7, { v: 'newer-from-server' })]
    const { resolved, conflicts } = mergeEntities(local, remote, NONE)
    expect(resolved).toEqual(remote)
    expect(conflicts).toEqual([])
  })

  it('records a CONFLICT when a pending local edit was superseded by a higher-rev remote (remote wins)', () => {
    const local = [ent('a', 1, { v: 'my-edit' })]
    const remote = [ent('a', 3, { v: 'their-edit' })]
    const { resolved, conflicts } = mergeEntities(local, remote, pending('a'))
    expect(resolved).toEqual(remote) // server-rev-primary: the advanced remote wins
    expect(conflicts).toEqual([{ type: 'term', id: 'a', local: local[0], server: remote[0] }])
  })

  it('keeps a pending local edit when the remote is not newer than its base (no conflict)', () => {
    const local = [ent('a', 3, { v: 'my-pending-edit' })]
    const remote = [ent('a', 3, { v: 'same-base' })] // rev == local.rev → not superseded
    const { resolved, conflicts } = mergeEntities(local, remote, pending('a'))
    expect(resolved).toEqual(local)
    expect(conflicts).toEqual([])
  })

  it('is clock-skew immune: a higher-rev remote wins even when its updatedAt is OLDER (rev is the authority)', () => {
    const local = [ent('a', 1, { v: 'mine' }, /*up*/ 9999)] // huge (skewed) client clock
    const remote = [ent('a', 2, { v: 'theirs' }, /*up*/ 10)] // older updatedAt but higher rev
    const { resolved, conflicts } = mergeEntities(local, remote, pending('a'))
    expect(resolved[0].payload).toEqual({ v: 'theirs' }) // rev 2 > rev 1 wins, NOT the larger updatedAt
    expect(conflicts).toHaveLength(1)
  })

  it('delete-wins: a remote tombstone at a higher rev supersedes a pending local live edit', () => {
    const local = [ent('a', 1, { v: 'still-here' })]
    const remote = [ent('a', 4, {}, 1, /*del*/ 500)] // tombstone
    const { resolved, conflicts } = mergeEntities(local, remote, pending('a'))
    expect(resolved[0].deletedAt).toBe(500)
    expect(conflicts).toHaveLength(1)
  })

  it('delete-then-readd: a local re-add (pending) loses to a higher-rev remote tombstone until re-pushed', () => {
    const local = [ent('a', 2, { v: 'readded' })] // re-added locally, pending, based on rev 2
    const remote = [ent('a', 5, {}, 1, /*del*/ 700)] // server deleted at rev 5
    const { resolved, conflicts } = mergeEntities(local, remote, pending('a'))
    expect(resolved[0].deletedAt).toBe(700) // tombstone wins → converges (re-add must be re-pushed)
    expect(conflicts).toHaveLength(1)
  })

  it('handles a mixed batch: local-only kept, remote-only adopted, shared reconciled', () => {
    const local = [ent('keepLocal', 0, { v: 'l' }), ent('shared', 2, { v: 'localShared' })]
    const remote = [ent('shared', 9, { v: 'remoteShared' }), ent('newRemote', 3, { v: 'r' })]
    const { resolved } = mergeEntities(local, remote, NONE)
    const byId = Object.fromEntries(resolved.map((e) => [e.id, e.payload]))
    expect(byId).toEqual({ keepLocal: { v: 'l' }, shared: { v: 'remoteShared' }, newRemote: { v: 'r' } })
  })

  it('is order-independent (same inputs, shuffled, give the same resolved set)', () => {
    const local = [ent('a', 1, { v: 'a' }), ent('b', 0, { v: 'b' })]
    const remote = [ent('a', 4, { v: 'a2' }), ent('c', 2, { v: 'c' })]
    const r1 = mergeEntities(local, remote, NONE).resolved.map((e) => e.id).sort()
    const r2 = mergeEntities([...local].reverse(), [...remote].reverse(), NONE).resolved.map((e) => e.id).sort()
    expect(r1).toEqual(r2)
    expect(r1).toEqual(['a', 'b', 'c'])
  })

  it('normalizes duplicate remote ids to the highest rev (a stale dup cannot mask a supersession, either order)', () => {
    const local = [ent('a', 1, { v: 'mine' })]
    // higher-rev dup first, then a stale dup
    const r1 = mergeEntities(local, [ent('a', 5, { v: 'win' }), ent('a', 1, { v: 'stale' })], pending('a'))
    expect(r1.resolved[0].payload).toEqual({ v: 'win' })
    expect(r1.conflicts).toHaveLength(1)
    // reversed order — same authoritative outcome
    const r2 = mergeEntities(local, [ent('a', 1, { v: 'stale' }), ent('a', 5, { v: 'win' })], pending('a'))
    expect(r2.resolved[0].payload).toEqual({ v: 'win' })
    expect(r2.conflicts).toHaveLength(1)
  })

  it('returns empty for empty inputs', () => {
    expect(mergeEntities([], [], NONE)).toEqual({ resolved: [], conflicts: [] })
  })
})

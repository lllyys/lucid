import { describe, it, expect, beforeEach } from 'vitest'
import { useSyncStore, migrateSync, partializeSync, type SyncState } from './syncStore'

beforeEach(() => {
  useSyncStore.getState().reset()
})

const cfg = { serverUrl: 'https://lucid.myserver.dev', token: 'tok-a4f2' }

describe('syncStore', () => {
  it('starts local-only with no config and zeroed transient state', () => {
    const s = useSyncStore.getState()
    expect(s.config).toBeNull()
    expect(s.status).toBe('local-only')
    expect(s.cursor).toBe(0)
    expect(s.seeded).toBe(false)
    expect(s.lastSyncedAt).toBeNull()
    expect(s.counts).toEqual({ sessions: 0, tasks: 0, terms: 0, keywords: 0 })
    expect(s.queuedCount).toBe(0)
    expect(s.lastConflict).toBeNull()
  })

  it('connect stores the config, enters connecting, and resets cursor + seeded for a fresh connection', () => {
    useSyncStore.setState({ cursor: 9, seeded: true }) // stale prior-server state
    useSyncStore.getState().connect(cfg)
    const s = useSyncStore.getState()
    expect(s.config).toEqual(cfg)
    expect(s.status).toBe('connecting')
    expect(s.cursor).toBe(0) // fresh server → re-seed/re-pull from scratch (idempotent)
    expect(s.seeded).toBe(false)
  })

  it('disconnect reverts fully to local-only (config + transient cleared)', () => {
    useSyncStore.getState().connect(cfg)
    useSyncStore.getState().setStatus('idle')
    useSyncStore.getState().setCounts({ sessions: 1, tasks: 2, terms: 3, keywords: 4 })
    useSyncStore.getState().disconnect()
    const s = useSyncStore.getState()
    expect(s.config).toBeNull()
    expect(s.status).toBe('local-only')
    expect(s.cursor).toBe(0)
    expect(s.seeded).toBe(false)
    expect(s.counts).toEqual({ sessions: 0, tasks: 0, terms: 0, keywords: 0 })
  })

  it('setStatus / setLastSynced / setQueuedCount update transient state', () => {
    useSyncStore.getState().setStatus('syncing')
    expect(useSyncStore.getState().status).toBe('syncing')
    useSyncStore.getState().setLastSynced(1234)
    expect(useSyncStore.getState().lastSyncedAt).toBe(1234)
    useSyncStore.getState().setQueuedCount(8)
    expect(useSyncStore.getState().queuedCount).toBe(8)
  })

  it('setCounts replaces the data-scope counts', () => {
    useSyncStore.getState().setCounts({ sessions: 12, tasks: 48, terms: 9, keywords: 23 })
    expect(useSyncStore.getState().counts).toEqual({ sessions: 12, tasks: 48, terms: 9, keywords: 23 })
  })

  it('recordConflict stores + clears the surfaced conflict signal', () => {
    useSyncStore.getState().recordConflict({ type: 'term', id: 'g1' })
    expect(useSyncStore.getState().lastConflict).toEqual({ type: 'term', id: 'g1' })
    useSyncStore.getState().recordConflict(null)
    expect(useSyncStore.getState().lastConflict).toBeNull()
  })

  it('setCursor and markSeeded update the persisted sync progress', () => {
    useSyncStore.getState().setCursor(42)
    expect(useSyncStore.getState().cursor).toBe(42)
    useSyncStore.getState().markSeeded()
    expect(useSyncStore.getState().seeded).toBe(true)
  })
})

describe('syncStore persist helpers', () => {
  it('migrateSync accepts a well-formed current-version value (sanitized to the durable fields)', () => {
    expect(migrateSync({ config: cfg, cursor: 5, seeded: true }, 1)).toEqual({ config: cfg, cursor: 5, seeded: true })
    expect(migrateSync({ config: null, cursor: 0, seeded: false }, 1)).toEqual({ config: null, cursor: 0, seeded: false })
  })
  it('migrateSync discards an older version or a non-object', () => {
    expect(migrateSync({ config: null, cursor: 0, seeded: false }, 0)).toBeUndefined()
    expect(migrateSync(null, 1)).toBeUndefined()
    expect(migrateSync(42, 1)).toBeUndefined()
  })
  it.each([
    { desc: 'config not an object', v: { config: 42, cursor: 0, seeded: false } },
    { desc: 'config serverUrl not a string', v: { config: { serverUrl: 1, token: 't' }, cursor: 0, seeded: false } },
    { desc: 'config token not a string', v: { config: { serverUrl: 'x', token: null }, cursor: 0, seeded: false } },
    { desc: 'cursor not a number', v: { config: null, cursor: 'x', seeded: false } },
    { desc: 'cursor not an integer', v: { config: null, cursor: 1.5, seeded: false } },
    { desc: 'cursor negative', v: { config: null, cursor: -1, seeded: false } },
    { desc: 'seeded not a boolean', v: { config: null, cursor: 0, seeded: 'yes' } },
  ])('migrateSync rejects a tampered persisted value: $desc → undefined → defaults', ({ v }) => {
    expect(migrateSync(v, 1)).toBeUndefined()
  })
  it('partializeSync persists ONLY config + cursor + seeded (never the transient status/counts)', () => {
    useSyncStore.getState().connect(cfg)
    useSyncStore.getState().setCursor(5)
    useSyncStore.getState().markSeeded()
    useSyncStore.getState().setStatus('syncing')
    useSyncStore.getState().setCounts({ sessions: 9, tasks: 0, terms: 0, keywords: 0 })
    const persisted = partializeSync(useSyncStore.getState())
    expect(Object.keys(persisted).sort()).toEqual(['config', 'cursor', 'seeded'])
    expect(persisted).toEqual({ config: cfg, cursor: 5, seeded: true })
  })
})

// Type-only guard: SyncState must expose the discriminated status union.
const _statusCheck: SyncState['status'] = 'idle'
void _statusCheck

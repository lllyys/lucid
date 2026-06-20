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
    expect(s.revs).toEqual({})
  })

  it('connect stores the config, enters connecting, and resets cursor + seeded + revs for a fresh connection', () => {
    useSyncStore.setState({ cursor: 9, seeded: true, revs: { a: 3 } }) // stale prior-server state
    useSyncStore.getState().connect(cfg)
    const s = useSyncStore.getState()
    expect(s.config).toEqual(cfg)
    expect(s.status).toBe('connecting')
    expect(s.cursor).toBe(0) // fresh server → re-seed/re-pull from scratch (idempotent)
    expect(s.seeded).toBe(false)
    expect(s.revs).toEqual({}) // stale per-entity revs cleared
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

  it('setRevs merges per-entity revs (does not replace the whole map)', () => {
    useSyncStore.getState().setRevs({ a: 1, b: 2 })
    useSyncStore.getState().setRevs({ b: 5, c: 3 }) // b updated, c added, a kept
    expect(useSyncStore.getState().revs).toEqual({ a: 1, b: 5, c: 3 })
  })

  // #19 WI-2 — connectSingleOrigin: token-free single-origin connect. Builds a config that targets the
  // served origin (window.location.origin) with an empty token and routes through connect(), so the
  // same fresh-server re-seed semantics (cursor 0 / seeded false / revs {}) apply.
  it('connectSingleOrigin targets window.location.origin with an empty token via connect()', () => {
    useSyncStore.setState({ cursor: 9, seeded: true, revs: { a: 3 } }) // stale prior-server state
    useSyncStore.getState().connectSingleOrigin()
    const s = useSyncStore.getState()
    expect(s.config).toEqual({ serverUrl: window.location.origin, token: '' })
    expect(s.config?.token).toBe('') // explicitly empty — token-free
    expect(s.status).toBe('connecting')
    expect(s.cursor).toBe(0) // re-seed semantics (server change → fresh, idempotent seed)
    expect(s.seeded).toBe(false)
    expect(s.revs).toEqual({})
  })

  it('connectSingleOrigin replaces a prior remote-token connection (server change → re-seed)', () => {
    useSyncStore.getState().connect(cfg) // a remote token server
    useSyncStore.getState().markSeeded()
    useSyncStore.getState().setCursor(42)
    useSyncStore.getState().connectSingleOrigin()
    const s = useSyncStore.getState()
    expect(s.config).toEqual({ serverUrl: window.location.origin, token: '' })
    expect(s.cursor).toBe(0)
    expect(s.seeded).toBe(false)
  })
})

describe('syncStore persist helpers', () => {
  // migrateSync is zustand's cross-version upgrade path (called ONLY on a version mismatch). It keeps
  // a valid connection `config` but forces a full, idempotent re-sync — a pre-rev-map blob's bare
  // cursor is NOT self-healing (an incremental pull never rebuilds the missing revs), so carrying it
  // forward would false-conflict the next edit to an unchanged entity.
  it('preserves a valid config but resets cursor + seeded + revs (untrusted across a version boundary)', () => {
    expect(migrateSync({ config: cfg, cursor: 42, seeded: true, revs: { a: 9 } })).toEqual({ config: cfg, cursor: 0, seeded: false, revs: {} })
  })
  it('preserves a null (local-only) config and resets the rest', () => {
    expect(migrateSync({ config: null, cursor: 7, seeded: true })).toEqual({ config: null, cursor: 0, seeded: false, revs: {} })
  })
  it('discards a pre-rev-map blob’s cursor/seeded even when they look valid (the non-self-healing case)', () => {
    // a bare cursor with no matching rev map is exactly the state we refuse to trust across versions
    expect(migrateSync({ config: cfg, cursor: 1000, seeded: true })).toEqual({ config: cfg, cursor: 0, seeded: false, revs: {} })
  })
  it('migrateSync returns undefined (→ local-only defaults) for a non-object', () => {
    expect(migrateSync(null)).toBeUndefined()
    expect(migrateSync(42)).toBeUndefined()
  })
  it.each([
    { desc: 'config not an object', v: { config: 42, cursor: 0, seeded: false } },
    { desc: 'config serverUrl not a string', v: { config: { serverUrl: 1, token: 't' }, cursor: 0, seeded: false } },
    { desc: 'config token not a string', v: { config: { serverUrl: 'x', token: null }, cursor: 0, seeded: false } },
  ])('migrateSync rejects a tampered config: $desc → undefined → defaults', ({ v }) => {
    expect(migrateSync(v)).toBeUndefined()
  })
  it('partializeSync persists ONLY config + cursor + seeded + revs (never the transient status/counts)', () => {
    useSyncStore.getState().connect(cfg)
    useSyncStore.getState().setCursor(5)
    useSyncStore.getState().markSeeded()
    useSyncStore.getState().setRevs({ a: 2 })
    useSyncStore.getState().setStatus('syncing')
    useSyncStore.getState().setCounts({ sessions: 9, tasks: 0, terms: 0, keywords: 0 })
    const persisted = partializeSync(useSyncStore.getState())
    expect(Object.keys(persisted).sort()).toEqual(['config', 'cursor', 'revs', 'seeded'])
    expect(persisted).toEqual({ config: cfg, cursor: 5, seeded: true, revs: { a: 2 } })
  })

  // #19 WI-2 — a token-free single-origin config has token: '' (an empty STRING, not null/missing). It
  // is a valid SyncConfig: migrateSync's `typeof token === 'string'` guard accepts '' (cross-version
  // path), and the same-version rehydrate path runs no guard, so '' survives BOTH ways.
  const originCfg = { serverUrl: window.location.origin, token: '' }
  it('migrateSync accepts an empty-token (single-origin) config and resets the rest', () => {
    expect(migrateSync({ config: originCfg, cursor: 9, seeded: true, revs: { a: 1 } })).toEqual({
      config: originCfg,
      cursor: 0,
      seeded: false,
      revs: {},
    })
  })
  it('partializeSync persists an empty-token (single-origin) config verbatim (same-version rehydrate path)', () => {
    useSyncStore.getState().connectSingleOrigin()
    const persisted = partializeSync(useSyncStore.getState())
    expect(persisted.config).toEqual(originCfg)
    expect(persisted.config?.token).toBe('') // empty token round-trips, not coerced away
  })
})

// Type-only guard: SyncState must expose the discriminated status union.
const _statusCheck: SyncState['status'] = 'idle'
void _statusCheck

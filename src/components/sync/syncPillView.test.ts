// WI-9a — the pure sync-pill view-model: every state + the relative-time formatting, deterministically.
import { describe, it, expect } from 'vitest'
import { syncPillView, type SyncPillState } from './syncPillView'
import type { SyncStatus } from '@/stores/syncStore'

const NOW = 1_700_000_000_000
const make = (status: SyncStatus, over: Partial<SyncPillState> = {}): SyncPillState => ({
  status,
  queuedCount: 0,
  lastSyncedAt: null,
  ...over,
})

describe('syncPillView', () => {
  it.each([
    ['local-only', 'idle', 'dot', false, 'sync.status.localOnly'],
    ['connecting', 'syncing', 'spinner', false, 'sync.status.connecting'],
    ['idle', 'synced', 'dot', false, 'sync.status.synced'],
    ['syncing', 'syncing', 'spinner', false, 'sync.status.syncing'],
    ['offline', 'warn', 'dot', false, 'sync.status.offline'],
    ['conflict', 'warn', 'warn-icon', false, 'sync.status.conflict'],
    ['auth-error', 'danger', 'dot', false, 'sync.status.authFailed'],
    ['unreachable', 'danger', 'dot', true, 'sync.status.unreachable'],
  ] as const)('maps %s → tone=%s indicator=%s pulse=%s', (status, tone, indicator, pulse, labelKey) => {
    const v = syncPillView(make(status), NOW)
    expect(v.tone).toBe(tone)
    expect(v.indicator).toBe(indicator)
    expect(v.pulse).toBe(pulse)
    expect(v.labelKey).toBe(labelKey)
  })

  it('syncing and offline details carry the queued count', () => {
    expect(syncPillView(make('syncing', { queuedCount: 12 }), NOW).detail).toEqual({ key: 'sync.detail.changes', vars: { n: 12 } })
    expect(syncPillView(make('offline', { queuedCount: 8 }), NOW).detail).toEqual({ key: 'sync.detail.queued', vars: { n: 8 } })
  })

  it('conflict reports one superseded edit; local-only shows not-syncing; auth-error has no detail', () => {
    expect(syncPillView(make('conflict'), NOW).detail).toEqual({ key: 'sync.detail.superseded', vars: { n: 1 } })
    expect(syncPillView(make('local-only'), NOW).detail).toEqual({ key: 'sync.detail.notSyncing' })
    expect(syncPillView(make('auth-error'), NOW).detail).toBeNull()
    expect(syncPillView(make('unreachable'), NOW).detail).toEqual({ key: 'sync.detail.retrying' })
  })

  describe('synced relative-time detail', () => {
    it('null lastSyncedAt → no detail', () => {
      expect(syncPillView(make('idle', { lastSyncedAt: null }), NOW).detail).toBeNull()
    })
    it('under a minute → just now', () => {
      expect(syncPillView(make('idle', { lastSyncedAt: NOW - 30_000 }), NOW).detail).toEqual({ key: 'sync.detail.justNow' })
    })
    it('minutes ago (floored)', () => {
      expect(syncPillView(make('idle', { lastSyncedAt: NOW - (2 * 60_000 + 59_000) }), NOW).detail).toEqual({ key: 'sync.detail.minutesAgo', vars: { n: 2 } })
    })
    it('hours ago (floored)', () => {
      expect(syncPillView(make('idle', { lastSyncedAt: NOW - 3 * 3_600_000 }), NOW).detail).toEqual({ key: 'sync.detail.hoursAgo', vars: { n: 3 } })
    })
    it('future timestamp (clock skew) clamps to just now', () => {
      expect(syncPillView(make('idle', { lastSyncedAt: NOW + 10_000 }), NOW).detail).toEqual({ key: 'sync.detail.justNow' })
    })
  })
})

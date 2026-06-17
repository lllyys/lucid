// Purpose: the pure view-model for the sync status pill (#9, WI-9a, design surface A). Maps the
// syncStore's 8-state status machine (+ queued count + last-synced timestamp) to a presentation-agnostic
// descriptor — tone, indicator, an i18n label key, and an optional i18n detail (key + interpolation
// vars). Kept pure and `now`-injected so every state AND the relative-time formatting are deterministically
// unit-testable; the SyncStatusPill component maps `tone` to design tokens and calls t() on the keys.
// All user-facing strings are i18n KEYS here (rule 66 §5) — never literals.

import type { SyncStatus } from '@/stores/syncStore'

export type PillTone = 'idle' | 'synced' | 'syncing' | 'warn' | 'danger'
export type PillIndicator = 'dot' | 'spinner' | 'warn-icon'

/** An i18n detail string: a flat key + optional `{{n}}` interpolation (n avoids i18next's count-plural path). */
export interface PillDetail {
  key: string
  vars?: { n: number }
}

export interface PillView {
  tone: PillTone
  indicator: PillIndicator
  pulse: boolean
  labelKey: string
  detail: PillDetail | null
}

/** The slice of syncStore the pill needs (counts/conflict-id live in the fuller Settings panel, not here). */
export interface SyncPillState {
  status: SyncStatus
  queuedCount: number
  lastSyncedAt: number | null
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Relative "x ago" detail for the synced state — an i18n key + count, or null when never synced. */
function syncedDetail(now: number, lastSyncedAt: number | null): PillDetail | null {
  if (lastSyncedAt === null) return null
  // Clamp negatives: a skewed clock (lastSyncedAt in the future) reads as "just now", never a negative age.
  const elapsed = Math.max(0, now - lastSyncedAt)
  if (elapsed < MINUTE) return { key: 'sync.detail.justNow' }
  if (elapsed < HOUR) return { key: 'sync.detail.minutesAgo', vars: { n: Math.floor(elapsed / MINUTE) } }
  return { key: 'sync.detail.hoursAgo', vars: { n: Math.floor(elapsed / HOUR) } }
}

/** Map the live sync state to the pill's presentation descriptor. Exhaustive over the 8 SyncStatus values. */
export function syncPillView(state: SyncPillState, now: number): PillView {
  switch (state.status) {
    case 'local-only':
      return { tone: 'idle', indicator: 'dot', pulse: false, labelKey: 'sync.status.localOnly', detail: { key: 'sync.detail.notSyncing' } }
    case 'connecting':
      return { tone: 'syncing', indicator: 'spinner', pulse: false, labelKey: 'sync.status.connecting', detail: null }
    case 'idle':
      return { tone: 'synced', indicator: 'dot', pulse: false, labelKey: 'sync.status.synced', detail: syncedDetail(now, state.lastSyncedAt) }
    case 'syncing':
      return { tone: 'syncing', indicator: 'spinner', pulse: false, labelKey: 'sync.status.syncing', detail: { key: 'sync.detail.changes', vars: { n: state.queuedCount } } }
    case 'offline':
      return { tone: 'warn', indicator: 'dot', pulse: false, labelKey: 'sync.status.offline', detail: { key: 'sync.detail.queued', vars: { n: state.queuedCount } } }
    case 'conflict':
      // v1 surfaces a single superseded edit (lastConflict) — the pill reports the one-edit signal.
      return { tone: 'warn', indicator: 'warn-icon', pulse: false, labelKey: 'sync.status.conflict', detail: { key: 'sync.detail.superseded', vars: { n: 1 } } }
    case 'auth-error':
      return { tone: 'danger', indicator: 'dot', pulse: false, labelKey: 'sync.status.authFailed', detail: null }
    case 'unreachable':
      return { tone: 'danger', indicator: 'dot', pulse: true, labelKey: 'sync.status.unreachable', detail: { key: 'sync.detail.retrying' } }
  }
}

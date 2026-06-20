// Purpose: the sync feature's config + live-state store (#9 WI-7a) — the seam the orchestrator
// (WI-7b) drives and the sync UI (WI-9) reads. Holds the connection config, the 8-state status
// machine the design depicts, the data-scope counts, the queued count, and the surfaced conflict
// signal. Components read via selectors (AGENTS.md) — never destructure.
//
// SECURITY (rule 65 §5 — documented exception): unlike provider API keys (in-memory only), the sync
// ACCESS TOKEN is PERSISTED here alongside the server URL. This is a deliberate, user-chosen exception
// (see dev-docs/designs/lucid-sync + the plan): background sync must survive reloads, the server is the
// user's own single-tenant box, and the token is transmitted over TLS only. The UI shows it redacted
// (…last4); it is NEVER logged. Only config + cursor + seeded + revs (the per-entity rev map) are
// persisted — never the transient status/counts/conflict. The trust boundary is documented further with the WI-8 server package.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'
import { isRecord } from '@/lib/guards'
import type { EntityType } from '@/lib/sync/types'

/** The design's canonical states: not-connected(=local-only) · connecting · idle(=synced) · syncing ·
 *  offline · conflict · auth-error · unreachable. */
export type SyncStatus =
  | 'local-only'
  | 'connecting'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'conflict'
  | 'auth-error'
  | 'unreachable'

export interface SyncConfig {
  serverUrl: string
  token: string
}
export interface SyncCounts {
  sessions: number
  tasks: number
  terms: number
  keywords: number
}
/** The surfaced v1 conflict signal (no side-by-side review/restore yet — design's "review deferred"). */
export interface SyncConflictInfo {
  type: EntityType
  id: string
}

export interface SyncState {
  config: SyncConfig | null // null = local-only (PERSISTED, incl. token — see header)
  cursor: number // last-seen server rev (PERSISTED)
  seeded: boolean // has the current server been seeded? (PERSISTED)
  // Per-entity last-synced rev (PERSISTED). The orchestrator feeds it from applied push revs + pulled
  // entity revs; it's the source of `baseRev` when a local edit is queued, so a future edit doesn't
  // false-conflict. Keyed by entity id.
  revs: Record<string, number>
  status: SyncStatus // transient
  lastSyncedAt: number | null // transient
  counts: SyncCounts // transient
  queuedCount: number // transient
  lastConflict: SyncConflictInfo | null // transient
  connect: (config: SyncConfig) => void
  disconnect: () => void
  setStatus: (status: SyncStatus) => void
  setLastSynced: (at: number) => void
  setCounts: (counts: SyncCounts) => void
  setQueuedCount: (n: number) => void
  recordConflict: (conflict: SyncConflictInfo | null) => void
  setCursor: (rev: number) => void
  setRevs: (updates: Record<string, number>) => void
  markSeeded: () => void
  reset: () => void
  /**
   * Token-free single-origin connect (#19 WI-2): target the served origin
   * (`window.location.origin`) with an empty token and route through `connect()`, so the same
   * fresh-server re-seed semantics apply (cursor 0 / seeded false / revs {}). The empty token makes the
   * REST backend omit the Authorization header; the server's token-free `/sync` needs none.
   */
  connectSingleOrigin: () => void
}

const PERSIST_VERSION = 2
const ZERO_COUNTS: SyncCounts = { sessions: 0, tasks: 0, terms: 0, keywords: 0 }
const INITIAL = {
  config: null as SyncConfig | null,
  cursor: 0,
  seeded: false,
  revs: {} as Record<string, number>,
  status: 'local-only' as SyncStatus,
  lastSyncedAt: null as number | null,
  counts: ZERO_COUNTS,
  queuedCount: 0,
  lastConflict: null as SyncConflictInfo | null,
}

/**
 * persist migrate — the cross-version upgrade path. zustand calls this ONLY when the persisted
 * version differs from PERSIST_VERSION; a matching-version blob hydrates as-is (so an established
 * cursor + rev map survive a normal reload). A pre-rev-map blob has no trustworthy per-entity rev
 * map, and a bare `cursor` WITHOUT a matching rev map is not self-healing: an incremental pull from
 * that cursor never re-fetches unchanged entities, so their revs stay missing and the next local
 * edit to one false-conflicts (and under v1 server-wins, is dropped). So across a version boundary
 * we keep only the connection `config` and force a full, idempotent re-sync (cursor 0, seeded false,
 * revs {}) rather than carrying a half-trusted cursor forward. A malformed/absent config →
 * undefined → local-only defaults. (Independent of `version` — a downgrade is salvaged the same
 * safe way, so the param is intentionally unused.)
 */
export function migrateSync(persisted: unknown): unknown {
  if (!isRecord(persisted)) return undefined
  const { config } = persisted
  const configOk =
    config === null ||
    (isRecord(config) && typeof config.serverUrl === 'string' && typeof config.token === 'string')
  if (!configOk) return undefined
  return { config, cursor: 0, seeded: false, revs: {} }
}
/** Persist ONLY the durable sync state — never the transient status/counts/conflict. */
export function partializeSync(s: SyncState): Pick<SyncState, 'config' | 'cursor' | 'seeded' | 'revs'> {
  return { config: s.config, cursor: s.cursor, seeded: s.seeded, revs: s.revs }
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      ...INITIAL,
      // A fresh connection re-seeds + re-pulls from scratch (cursor 0, seeded false) — idempotent, so
      // reconnecting to the same server is safe. A reload rehydrates config/cursor/seeded and does NOT
      // call connect(), so an established cursor survives restarts.
      connect: (config) => set({ config, status: 'connecting', cursor: 0, seeded: false, revs: {} }),
      // #19 WI-2: token-free single-origin. Reuse connect()'s exact re-seed semantics with a config
      // that targets the served origin and an empty token (→ backend omits the Authorization header).
      connectSingleOrigin: () =>
        set({ config: { serverUrl: window.location.origin, token: '' }, status: 'connecting', cursor: 0, seeded: false, revs: {} }),
      disconnect: () => set({ ...INITIAL }),
      setStatus: (status) => set({ status }),
      setLastSynced: (lastSyncedAt) => set({ lastSyncedAt }),
      setCounts: (counts) => set({ counts }),
      setQueuedCount: (queuedCount) => set({ queuedCount }),
      recordConflict: (lastConflict) => set({ lastConflict }),
      setCursor: (cursor) => set({ cursor }),
      setRevs: (updates) => set((s) => ({ revs: { ...s.revs, ...updates } })),
      markSeeded: () => set({ seeded: true }),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'lucid.sync',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })),
      migrate: migrateSync,
      partialize: partializeSync,
    },
  ),
)

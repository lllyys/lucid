// Purpose: the sync feature's config + live-state store (#9 WI-7a) — the seam the orchestrator
// (WI-7b) drives and the sync UI (WI-9) reads. Holds the connection config, the 8-state status
// machine the design depicts, the data-scope counts, the queued count, and the surfaced conflict
// signal. Components read via selectors (AGENTS.md) — never destructure.
//
// SECURITY (rule 65 §5 — documented exception): unlike provider API keys (in-memory only), the sync
// ACCESS TOKEN is PERSISTED here alongside the server URL. This is a deliberate, user-chosen exception
// (see dev-docs/designs/lucid-sync + the plan): background sync must survive reloads, the server is the
// user's own single-tenant box, and the token is transmitted over TLS only. The UI shows it redacted
// (…last4); it is NEVER logged. Only config + cursor + seeded are persisted — never the transient
// status/counts/conflict. The trust boundary is documented further with the WI-8 server package.

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
  markSeeded: () => void
  reset: () => void
}

const PERSIST_VERSION = 1
const ZERO_COUNTS: SyncCounts = { sessions: 0, tasks: 0, terms: 0, keywords: 0 }
const INITIAL = {
  config: null as SyncConfig | null,
  cursor: 0,
  seeded: false,
  status: 'local-only' as SyncStatus,
  lastSyncedAt: null as number | null,
  counts: ZERO_COUNTS,
  queuedCount: 0,
  lastConflict: null as SyncConflictInfo | null,
}

/**
 * persist migrate: accept only the current version, and SANITIZE — safeJSONStorage proves valid JSON,
 * not a valid shape, so a tampered/partially-corrupt blob (`cursor:'x'`, `token:null`, a stray
 * `status` key) must not hydrate invalid durable state. Returns only the validated durable fields
 * ({config, cursor, seeded}); anything malformed → undefined → defaults (local-only).
 */
export function migrateSync(persisted: unknown, version: number): unknown {
  if (version !== PERSIST_VERSION || !isRecord(persisted)) return undefined
  const { config, cursor, seeded } = persisted
  const configOk =
    config === null ||
    (isRecord(config) && typeof config.serverUrl === 'string' && typeof config.token === 'string')
  const cursorOk = typeof cursor === 'number' && Number.isSafeInteger(cursor) && cursor >= 0
  if (!configOk || typeof seeded !== 'boolean' || !cursorOk) return undefined
  return { config, cursor, seeded }
}
/** Persist ONLY the durable connection state — never the transient status/counts/conflict. */
export function partializeSync(s: SyncState): Pick<SyncState, 'config' | 'cursor' | 'seeded'> {
  return { config: s.config, cursor: s.cursor, seeded: s.seeded }
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      ...INITIAL,
      // A fresh connection re-seeds + re-pulls from scratch (cursor 0, seeded false) — idempotent, so
      // reconnecting to the same server is safe. A reload rehydrates config/cursor/seeded and does NOT
      // call connect(), so an established cursor survives restarts.
      connect: (config) => set({ config, status: 'connecting', cursor: 0, seeded: false }),
      disconnect: () => set({ ...INITIAL }),
      setStatus: (status) => set({ status }),
      setLastSynced: (lastSyncedAt) => set({ lastSyncedAt }),
      setCounts: (counts) => set({ counts }),
      setQueuedCount: (queuedCount) => set({ queuedCount }),
      recordConflict: (lastConflict) => set({ lastConflict }),
      setCursor: (cursor) => set({ cursor }),
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

// Purpose: the PERSISTED offline push-queue store (#9 WI-7b-vi-d). Holds the local edits awaiting push
// as a JSON-friendly `QueueEntry[]` (the pure `PushQueue` Map from src/lib/sync/queue is reconstructed
// at the boundary), so offline edits survive a reload. The orchestrator drains it through `runCycle`;
// domain-store edits enqueue into it when sync is active. The collapse/seq/ack semantics live in
// src/lib/sync/queue (single source of truth) — this store only wires that pure logic to persisted
// reactive state. Persisted via the crash-proof safeJSONStorage; a corrupt blob sanitizes to its valid
// entries on rehydration (merge), never crashes. Not secret — the API key is never here (rule 65 §5).
// Components/selectors read via selectors (AGENTS.md), never destructure.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'
import { isRecord, isNonNegInt } from '@/lib/guards'
import { isPushOp } from '@/lib/sync/guards'
import { enqueue as qEnqueue, ack as qAck, pending } from '@/lib/sync/queue'
import type { PushQueue, QueueEntry } from '@/lib/sync/queue'
import type { PushOp } from '@/lib/sync/types'

const PERSIST_VERSION = 1

interface SyncQueueState {
  entries: QueueEntry[]
  enqueue: (op: PushOp) => void
  ack: (snapshot: readonly QueueEntry[]) => void
  reset: () => void
}

const INITIAL: Pick<SyncQueueState, 'entries'> = { entries: [] }

/** Rebuild the pure `PushQueue` Map (id → entry) from the persisted array, preserving each seq. */
const toMap = (entries: readonly QueueEntry[]): PushQueue => new Map(entries.map((e) => [e.op.id, e]))

/**
 * Sanitize a persisted value into a valid `QueueEntry[]`. safeJSONStorage proves valid JSON, not a
 * valid shape, so a tampered/partial blob must not hydrate a malformed op that would be pushed to the
 * server. Drops any entry without a well-formed `PushOp` or a non-negative-integer `seq`, and de-dupes
 * by id (the queue is id-keyed — a duplicate would let a stale op mask the latest). On a duplicate id,
 * the HIGHEST `seq` wins (the freshest edit; on a tie the later entry), since `seq` is the only
 * freshness signal available once a duplicate exists. Never throws.
 */
export function sanitizeQueueEntries(persisted: unknown): QueueEntry[] {
  if (!isRecord(persisted) || !Array.isArray(persisted.entries)) return []
  const byId = new Map<string, QueueEntry>() // keyed by id; keeps insertion order of first occurrence
  for (const e of persisted.entries as unknown[]) {
    if (!isRecord(e) || !isPushOp(e.op) || !isNonNegInt(e.seq)) continue
    const existing = byId.get(e.op.id)
    if (existing === undefined || e.seq >= existing.seq) byId.set(e.op.id, { op: e.op, seq: e.seq })
  }
  return [...byId.values()]
}

/** Persist ONLY the entries. */
export function partializeSyncQueue(s: SyncQueueState): Pick<SyncQueueState, 'entries'> {
  return { entries: s.entries }
}

/**
 * merge runs on EVERY hydration (not just a version mismatch, unlike `migrate`), so it is where the
 * persisted queue is sanitized. Preserves the live actions from `current`.
 */
export function mergeSyncQueue(persisted: unknown, current: SyncQueueState): SyncQueueState {
  return { ...current, entries: sanitizeQueueEntries(persisted) }
}

export const useSyncQueueStore = create<SyncQueueState>()(
  persist(
    (set) => ({
      ...INITIAL,
      // collapse + seq + ack semantics are delegated to the pure queue module; this only round-trips
      // the Map through the persisted array.
      enqueue: (op) => set((s) => ({ entries: pending(qEnqueue(toMap(s.entries), op)) })),
      ack: (snapshot) => set((s) => ({ entries: pending(qAck(toMap(s.entries), snapshot)) })),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'lucid.syncQueue',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })),
      partialize: partializeSyncQueue,
      merge: mergeSyncQueue,
    },
  ),
)

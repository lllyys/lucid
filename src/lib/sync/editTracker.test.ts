import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startEditTracking } from './editTracker'
import { runSuppressed } from './applyGuard'
import { useSyncStore } from '@/stores/syncStore'
import { useSyncQueueStore } from '@/stores/syncQueueStore'
import { useGlossaryStore, type Term } from '@/stores/glossaryStore'
import { useSessionStore } from '@/stores/sessionStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'

const term = (id: string, label: string): Term => ({ id, label, createdAt: 1, updatedAt: 1, deletedAt: null })
const NOW = 1000

let stop: (() => void) | undefined
let onEdit: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  stop?.()
  stop = undefined
  useSessionStore.getState().reset()
  useGlossaryStore.getState().reset()
  usePolishKeywordsStore.getState().reset()
  useSyncStore.getState().reset()
  useSyncQueueStore.getState().reset()
  onEdit = vi.fn<() => void>()
})

const start = () => {
  stop = startEditTracking({ now: () => NOW, onEdit })
}

describe('startEditTracking', () => {
  it('enqueues a PushOp for a new local entity, updates queuedCount, and notifies onEdit', () => {
    start()
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    expect(useSyncQueueStore.getState().entries).toEqual([
      { op: { type: 'term', id: 'g1', payload: { label: 'API', createdAt: 1 }, updatedAt: 1, deletedAt: null, baseRev: 0 }, seq: 1 },
    ])
    expect(useSyncStore.getState().queuedCount).toBe(1)
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('uses the entity’s last-synced rev as baseRev when editing a synced entity', () => {
    useGlossaryStore.setState({ terms: [term('g1', 'old')] })
    useSyncStore.setState({ revs: { g1: 5 } })
    start() // baseline = [g1 'old']
    useGlossaryStore.setState({ terms: [{ ...term('g1', 'new'), updatedAt: 2 }] })
    expect(useSyncQueueStore.getState().entries[0].op).toMatchObject({ id: 'g1', payload: { label: 'new' }, baseRev: 5 })
  })

  it('synthesizes a tombstone op when a local entity is deleted (hard-removed)', () => {
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    useSyncStore.setState({ revs: { g1: 4 } })
    start()
    useGlossaryStore.setState({ terms: [] }) // delete g1
    expect(useSyncQueueStore.getState().entries[0].op).toMatchObject({ id: 'g1', deletedAt: NOW, baseRev: 4 })
  })

  it('does NOT enqueue a sync-applied commit (echo guard), but absorbs it into the baseline', () => {
    start()
    runSuppressed(() => useGlossaryStore.setState({ terms: [term('g1', 'fromServer')] }))
    expect(useSyncQueueStore.getState().entries).toEqual([]) // not enqueued
    expect(onEdit).not.toHaveBeenCalled()
    // a subsequent REAL edit diffs only its OWN delta — the absorbed server change isn't re-enqueued
    useGlossaryStore.setState({ terms: [term('g1', 'fromServer'), term('g2', 'mine')] })
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['g2'])
  })

  it('ignores a non-content store change (e.g. selecting a session) — nothing enqueued', () => {
    useSessionStore.setState({ sessions: [], activeSessionId: null })
    start()
    useSessionStore.setState({ activeSessionId: 'whatever' }) // not a synced field
    expect(useSyncQueueStore.getState().entries).toEqual([])
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('tracks all three domain stores', () => {
    start()
    usePolishKeywordsStore.setState({ keywords: [{ id: 'k1', value: 'kw', updatedAt: 1, deletedAt: null }] })
    expect(useSyncQueueStore.getState().entries.map((e) => e.op.id)).toEqual(['k1'])
  })

  it('stop() unsubscribes — later edits are not tracked', () => {
    start()
    stop?.()
    stop = undefined
    useGlossaryStore.setState({ terms: [term('g1', 'API')] })
    expect(useSyncQueueStore.getState().entries).toEqual([])
    expect(onEdit).not.toHaveBeenCalled()
  })
})

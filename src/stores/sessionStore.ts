// Purpose: the persisted Sessions + Tasks history for the sidebar (feature #3, WI-1). A session
// holds the tasks (accepted translate/polish results) recorded under it; one session is active and
// receives new tasks. Persisted to localStorage via the crash-proof safeJSONStorage (WI-3) — corrupt
// or oversized data boots to an empty history, never crashes. History is capped (oldest dropped) so
// it can't grow unbounded. The API key is NEVER here — it lives only in the in-memory providerStore
// (rule 65 §5). Session text is the user's own, stored locally only, never transmitted (rule 65 §6).
// Components read via selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { notifyStorageFull } from '@/lib/storage/quotaNotice'
import i18n from '@/i18n'

// Sync envelope (#9): every syncable entity carries `updatedAt` (client logical timestamp — display
// metadata; the SERVER-assigned rev is the ordering authority) + `deletedAt` (tombstone; null = live).
// Added additively here; tombstone-on-delete semantics + selector filtering land with the sync layer.
export interface Task {
  id: string
  kind: 'translate' | 'polish'
  title: string
  sourceText: string
  resultText: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}
export interface Session {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  tasks: Task[]
}

export const MAX_SESSIONS = 50
export const MAX_TASKS_PER_SESSION = 200
const PERSIST_VERSION = 2

// Injectable clock + id counter (test seams, mirroring operationStore.setOperationClock).
let clock: () => number = Date.now
let idSeq = 0
const genId = (prefix: string): string => `${prefix}${++idSeq}`
export function __setSessionClock(fn: () => number): void {
  clock = fn
}
export function __resetSessionIds(): void {
  idSeq = 0
}

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  newSession: () => string
  renameSession: (id: string, name: string) => void
  deleteSession: (id: string) => void
  selectSession: (id: string) => void
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => void
  reset: () => void
}

const INITIAL: Pick<SessionState, 'sessions' | 'activeSessionId'> = { sessions: [], activeSessionId: null }

/** Pure search selector — case-insensitive substring over session name + each task title/source. */
export function searchSessions(sessions: Session[], query: string): Session[] {
  const q = query.trim().toLowerCase()
  if (q === '') return sessions
  return sessions.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.tasks.some((t) => t.title.toLowerCase().includes(q) || t.sourceText.toLowerCase().includes(q)),
  )
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * persist migrate: v2 (current) passes through; v1 predates the sync envelope, so backfill
 * `updatedAt` and `deletedAt: null` onto every session and task. A session's `updatedAt` is the
 * max of its own createdAt and its newest task's createdAt — the same invariant `addTask` keeps for
 * live sessions, so migrated and live data look identical.
 *
 * Migration never throws AND never poisons the store. safeJSONStorage guarantees valid JSON but NOT
 * a valid shape, so each level is guarded: a non-object top level or a non-array `sessions` →
 * undefined → defaults; a session/task entry that is not an object OR is missing a required field of
 * the right type is skipped (one malformed entry never discards the rest). Validating the string
 * fields matters — `searchSessions` calls `.toLowerCase()` on `name`/`title`/`sourceText`, so a
 * non-string there would crash normal use, not merely look odd; numeric `createdAt` is validated too
 * so a tampered value can't poison `updatedAt` with NaN.
 *
 * Sync baseline (#9): this only adds the envelope. Hard deletes performed before the
 * tombstone-on-delete WI lands produce NO tombstone — they are simply absent from the migrated
 * state, and the sync layer treats the first push of migrated data as the baseline, not as a set
 * of resurrections. Selector filtering on `deletedAt` ships in the same WI that first creates a
 * tombstone, so there is no window where a tombstone exists but is not filtered.
 */
export function migrateSessions(persisted: unknown, version: number): unknown {
  if (version === PERSIST_VERSION) return persisted
  if (version === 1) {
    if (!isRecord(persisted) || !Array.isArray(persisted.sessions)) return undefined
    const sessions: Session[] = []
    for (const rawSession of persisted.sessions as unknown[]) {
      if (!isRecord(rawSession)) continue // null/garbage entry → skip, don't crash; salvage the rest
      if (typeof rawSession.id !== 'string' || typeof rawSession.name !== 'string' || typeof rawSession.createdAt !== 'number') {
        continue // malformed session → skip
      }
      const tasks: Task[] = []
      for (const rawTask of (Array.isArray(rawSession.tasks) ? rawSession.tasks : []) as unknown[]) {
        if (!isRecord(rawTask)) continue
        if (
          typeof rawTask.id !== 'string' ||
          (rawTask.kind !== 'translate' && rawTask.kind !== 'polish') ||
          typeof rawTask.title !== 'string' ||
          typeof rawTask.sourceText !== 'string' ||
          typeof rawTask.resultText !== 'string' ||
          typeof rawTask.createdAt !== 'number'
        ) {
          continue // malformed task → skip
        }
        tasks.push({
          id: rawTask.id,
          kind: rawTask.kind,
          title: rawTask.title,
          sourceText: rawTask.sourceText,
          resultText: rawTask.resultText,
          createdAt: rawTask.createdAt,
          updatedAt: rawTask.createdAt,
          deletedAt: null,
        })
      }
      sessions.push({
        id: rawSession.id,
        name: rawSession.name,
        createdAt: rawSession.createdAt,
        updatedAt: tasks.reduce((max, t) => Math.max(max, t.createdAt), rawSession.createdAt),
        deletedAt: null,
        tasks,
      })
    }
    // Drop a dangling active id (else addTask would silently discard tasks into a missing session).
    const active = persisted.activeSessionId
    const activeSessionId = typeof active === 'string' && sessions.some((s) => s.id === active) ? active : null
    return { sessions, activeSessionId }
  }
  return undefined
}

/** What gets persisted — the data only (never derived/transient fields). Takes the full
 * SessionState because zustand's `partialize` is typed `(state: SessionState) => …`. */
export function partializeSessions(s: SessionState): Pick<SessionState, 'sessions' | 'activeSessionId'> {
  return { sessions: s.sessions, activeSessionId: s.activeSessionId }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      newSession: () => {
        const id = genId('s')
        const now = clock()
        const session: Session = {
          id,
          name: i18n.t('sidebar.untitledSession'),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          tasks: [],
        }
        const sessions = [...get().sessions, session].slice(-MAX_SESSIONS) // cap: drop oldest
        set({ sessions, activeSessionId: id })
        return id
      },
      renameSession: (id, name) =>
        set({ sessions: get().sessions.map((s) => (s.id === id ? { ...s, name, updatedAt: clock() } : s)) }),
      deleteSession: (id) => {
        const sessions = get().sessions.filter((s) => s.id !== id)
        const activeSessionId = get().activeSessionId === id ? null : get().activeSessionId
        set({ sessions, activeSessionId })
      },
      selectSession: (id) => set({ activeSessionId: id }),
      addTask: (task) => {
        const activeId = get().activeSessionId
        if (activeId === null) return // no active session → nothing to record
        const now = clock()
        const full: Task = { ...task, id: genId('t'), createdAt: now, updatedAt: now, deletedAt: null }
        set({
          sessions: get().sessions.map((s) =>
            s.id === activeId
              ? { ...s, updatedAt: now, tasks: [...s.tasks, full].slice(-MAX_TASKS_PER_SESSION) }
              : s,
          ),
        })
      },
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'lucid.sessions',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })),
      migrate: migrateSessions,
      partialize: partializeSessions,
    },
  ),
)

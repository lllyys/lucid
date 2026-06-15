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
import { notify } from '@/components/workspace/notify'
import i18n from '@/i18n'

export interface Task {
  id: string
  kind: 'translate' | 'polish'
  title: string
  sourceText: string
  resultText: string
  createdAt: number
}
export interface Session {
  id: string
  name: string
  createdAt: number
  tasks: Task[]
}

export const MAX_SESSIONS = 50
export const MAX_TASKS_PER_SESSION = 200
const PERSIST_VERSION = 1

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
  addTask: (task: Pick<Task, 'kind' | 'title' | 'sourceText' | 'resultText'>) => void
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

/** persist migrate: only the current version is accepted; anything else → undefined → defaults. */
export function migrateSessions(persisted: unknown, version: number): unknown {
  return version === PERSIST_VERSION ? persisted : undefined
}

// One-time, localized quota notice (rule 65 §4 — a failed save is not silent).
let quotaNotified = false
export function handleStorageQuota(): void {
  if (quotaNotified) return
  quotaNotified = true
  notify(i18n.t('error.storageFull'))
}
export function __resetQuotaNotice(): void {
  quotaNotified = false
}

/** What gets persisted — the data only (never derived/transient fields). */
export function partializeSessions(s: SessionState): Pick<SessionState, 'sessions' | 'activeSessionId'> {
  return { sessions: s.sessions, activeSessionId: s.activeSessionId }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      newSession: () => {
        const id = genId('s')
        const session: Session = { id, name: i18n.t('sidebar.untitledSession'), createdAt: clock(), tasks: [] }
        const sessions = [...get().sessions, session].slice(-MAX_SESSIONS) // cap: drop oldest
        set({ sessions, activeSessionId: id })
        return id
      },
      renameSession: (id, name) =>
        set({ sessions: get().sessions.map((s) => (s.id === id ? { ...s, name } : s)) }),
      deleteSession: (id) => {
        const sessions = get().sessions.filter((s) => s.id !== id)
        const activeSessionId = get().activeSessionId === id ? null : get().activeSessionId
        set({ sessions, activeSessionId })
      },
      selectSession: (id) => set({ activeSessionId: id }),
      addTask: (task) => {
        const activeId = get().activeSessionId
        if (activeId === null) return // no active session → nothing to record
        const full: Task = { ...task, id: genId('t'), createdAt: clock() }
        set({
          sessions: get().sessions.map((s) =>
            s.id === activeId ? { ...s, tasks: [...s.tasks, full].slice(-MAX_TASKS_PER_SESSION) } : s,
          ),
        })
      },
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'lucid.sessions',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: handleStorageQuota })),
      migrate: migrateSessions,
      partialize: partializeSessions,
    },
  ),
)

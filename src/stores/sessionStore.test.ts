import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/components/workspace/notify', () => ({ notify: vi.fn() }))
import { notify } from '@/components/workspace/notify'
import {
  useSessionStore,
  searchSessions,
  migrateSessions,
  partializeSessions,
  handleStorageQuota,
  __setSessionClock,
  __resetSessionIds,
  __resetQuotaNotice,
  MAX_SESSIONS,
  MAX_TASKS_PER_SESSION,
  type Session,
} from './sessionStore'

const mockNotify = vi.mocked(notify)

let t = 1000
beforeEach(() => {
  mockNotify.mockReset()
  __resetSessionIds()
  __resetQuotaNotice()
  t = 1000
  __setSessionClock(() => ++t)
  useSessionStore.getState().reset()
})

const sample = (name: string, tasks: Session['tasks'] = []): Session => ({ id: name, name, createdAt: 1, tasks })

describe('sessionStore', () => {
  it('starts empty with no active session', () => {
    const s = useSessionStore.getState()
    expect(s.sessions).toEqual([])
    expect(s.activeSessionId).toBeNull()
  })

  it('newSession creates + selects a session and returns its id', () => {
    const id = useSessionStore.getState().newSession()
    const s = useSessionStore.getState()
    expect(s.sessions).toHaveLength(1)
    expect(s.activeSessionId).toBe(id)
    expect(s.sessions[0].id).toBe(id)
  })

  it('renameSession changes the name', () => {
    const id = useSessionStore.getState().newSession()
    useSessionStore.getState().renameSession(id, 'My session')
    expect(useSessionStore.getState().sessions[0].name).toBe('My session')
  })

  it('deleteSession removes it and clears active when it was active', () => {
    const id = useSessionStore.getState().newSession()
    useSessionStore.getState().deleteSession(id)
    expect(useSessionStore.getState().sessions).toHaveLength(0)
    expect(useSessionStore.getState().activeSessionId).toBeNull()
  })

  it('selectSession sets the active id', () => {
    const a = useSessionStore.getState().newSession()
    const b = useSessionStore.getState().newSession()
    useSessionStore.getState().selectSession(a)
    expect(useSessionStore.getState().activeSessionId).toBe(a)
    expect(b).not.toBe(a)
  })

  it('addTask appends a task (with derived id + createdAt) to the active session', () => {
    useSessionStore.getState().newSession()
    useSessionStore.getState().addTask({ kind: 'translate', title: 'Hello', sourceText: 'Hello', resultText: '你好' })
    const task = useSessionStore.getState().sessions[0].tasks[0]
    expect(task).toMatchObject({ kind: 'translate', title: 'Hello', sourceText: 'Hello', resultText: '你好' })
    expect(task.id).toBeTruthy()
    expect(typeof task.createdAt).toBe('number')
  })

  it('addTask is a no-op when there is no active session', () => {
    useSessionStore.getState().addTask({ kind: 'polish', title: 'x', sourceText: 'x', resultText: 'y' })
    expect(useSessionStore.getState().sessions).toHaveLength(0)
  })

  it('caps sessions at MAX_SESSIONS (drops the oldest)', () => {
    for (let i = 0; i < MAX_SESSIONS + 3; i++) useSessionStore.getState().newSession()
    expect(useSessionStore.getState().sessions.length).toBe(MAX_SESSIONS)
  })

  it('caps tasks per session at MAX_TASKS_PER_SESSION (drops the oldest)', () => {
    useSessionStore.getState().newSession()
    for (let i = 0; i < MAX_TASKS_PER_SESSION + 5; i++) {
      useSessionStore.getState().addTask({ kind: 'translate', title: `t${i}`, sourceText: `t${i}`, resultText: 'r' })
    }
    const tasks = useSessionStore.getState().sessions[0].tasks
    expect(tasks.length).toBe(MAX_TASKS_PER_SESSION)
    expect(tasks[tasks.length - 1].title).toBe(`t${MAX_TASKS_PER_SESSION + 4}`) // newest kept
  })

  it('rename/delete/addTask touch only the target session (multi-session)', () => {
    const a = useSessionStore.getState().newSession()
    const b = useSessionStore.getState().newSession() // b is active
    // rename a → b unchanged
    useSessionStore.getState().renameSession(a, 'Renamed A')
    expect(useSessionStore.getState().sessions.find((s) => s.id === a)!.name).toBe('Renamed A')
    expect(useSessionStore.getState().sessions.find((s) => s.id === b)!.name).toBe('Untitled session')
    // addTask goes to the active (b) only
    useSessionStore.getState().addTask({ kind: 'translate', title: 'x', sourceText: 'x', resultText: 'y' })
    expect(useSessionStore.getState().sessions.find((s) => s.id === a)!.tasks).toHaveLength(0)
    expect(useSessionStore.getState().sessions.find((s) => s.id === b)!.tasks).toHaveLength(1)
    // delete the NON-active session (a) → active stays b
    useSessionStore.getState().deleteSession(a)
    expect(useSessionStore.getState().sessions.map((s) => s.id)).toEqual([b])
    expect(useSessionStore.getState().activeSessionId).toBe(b)
  })

  it('reset clears everything', () => {
    useSessionStore.getState().newSession()
    useSessionStore.getState().reset()
    expect(useSessionStore.getState().sessions).toEqual([])
    expect(useSessionStore.getState().activeSessionId).toBeNull()
  })
})

describe('searchSessions selector', () => {
  const sessions: Session[] = [
    sample('Alpha project', [{ id: 't1', kind: 'translate', title: 'quantum note', sourceText: 'quantum physics', resultText: '', createdAt: 1 }]),
    sample('Beta notes'),
  ]
  it('empty query returns all', () => {
    expect(searchSessions(sessions, '')).toHaveLength(2)
    expect(searchSessions(sessions, '   ')).toHaveLength(2)
  })
  it('matches by session name (case-insensitive)', () => {
    expect(searchSessions(sessions, 'beta')).toHaveLength(1)
  })
  it('matches by task title and source text', () => {
    expect(searchSessions(sessions, 'quantum')).toHaveLength(1)
    expect(searchSessions(sessions, 'physics')).toHaveLength(1)
  })
  it('returns none when nothing matches', () => {
    expect(searchSessions(sessions, 'zzzzz')).toHaveLength(0)
  })
})

describe('persist helpers', () => {
  it('migrateSessions discards an older/unknown version (→ undefined → defaults)', () => {
    expect(migrateSessions({ sessions: [] }, 0)).toBeUndefined()
    expect(migrateSessions(undefined, 0)).toBeUndefined()
  })
  it('migrateSessions passes through current version', () => {
    const state = { sessions: [], activeSessionId: null }
    expect(migrateSessions(state, 1)).toBe(state)
  })
  it('handleStorageQuota notifies once per session', () => {
    handleStorageQuota()
    handleStorageQuota()
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })
  it('partializeSessions persists only sessions + activeSessionId', () => {
    expect(partializeSessions({ sessions: [], activeSessionId: 'x' } as never)).toEqual({
      sessions: [],
      activeSessionId: 'x',
    })
  })
})

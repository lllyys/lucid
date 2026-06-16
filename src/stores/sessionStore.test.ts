import { describe, it, expect, beforeEach } from 'vitest'

import {
  useSessionStore,
  searchSessions,
  migrateSessions,
  partializeSessions,
  __setSessionClock,
  __resetSessionIds,
  MAX_SESSIONS,
  MAX_TASKS_PER_SESSION,
  type Session,
} from './sessionStore'

let t = 1000
beforeEach(() => {
  __resetSessionIds()
  t = 1000
  __setSessionClock(() => ++t)
  useSessionStore.getState().reset()
})

const sample = (name: string, tasks: Session['tasks'] = []): Session => ({
  id: name,
  name,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  tasks,
})

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

describe('sessionStore sync envelope (#9 WI-1)', () => {
  it('newSession stamps updatedAt (=createdAt) and a null deletedAt tombstone', () => {
    useSessionStore.getState().newSession()
    const s = useSessionStore.getState().sessions[0]
    expect(s.createdAt).toBe(s.updatedAt) // both stamped from one clock read
    expect(s.deletedAt).toBeNull()
  })

  it('addTask stamps the task updatedAt/deletedAt and bumps the parent session updatedAt', () => {
    useSessionStore.getState().newSession()
    const createdSessionUpdatedAt = useSessionStore.getState().sessions[0].updatedAt
    useSessionStore.getState().addTask({ kind: 'translate', title: 'Hi', sourceText: 'Hi', resultText: '你好' })
    const session = useSessionStore.getState().sessions[0]
    const task = session.tasks[0]
    expect(task.createdAt).toBe(task.updatedAt)
    expect(task.deletedAt).toBeNull()
    expect(session.updatedAt).toBe(task.updatedAt) // session touched at the same moment as the task
    expect(session.updatedAt).toBeGreaterThan(createdSessionUpdatedAt) // and bumped past creation
  })

  it('renameSession bumps the session updatedAt', () => {
    const id = useSessionStore.getState().newSession()
    const before = useSessionStore.getState().sessions[0].updatedAt
    useSessionStore.getState().renameSession(id, 'Renamed')
    expect(useSessionStore.getState().sessions[0].updatedAt).toBeGreaterThan(before)
  })
})

describe('searchSessions selector', () => {
  const sessions: Session[] = [
    sample('Alpha project', [
      { id: 't1', kind: 'translate', title: 'quantum note', sourceText: 'quantum physics', resultText: '', createdAt: 1, updatedAt: 1, deletedAt: null },
    ]),
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
  it('migrateSessions passes through current version (v2) by reference', () => {
    const state = { sessions: [], activeSessionId: null }
    expect(migrateSessions(state, 2)).toBe(state)
  })
  it('migrateSessions backfills v1 → v2: every session + task gains updatedAt and deletedAt:null', () => {
    const v1 = {
      sessions: [
        {
          id: 's1',
          name: 'Legacy',
          createdAt: 42,
          tasks: [{ id: 't1', kind: 'translate', title: 'Hi', sourceText: 'Hi', resultText: '你好', createdAt: 7 }],
        },
      ],
      activeSessionId: 's1',
    }
    const migrated = migrateSessions(v1, 1) as { sessions: Session[]; activeSessionId: string | null }
    expect(migrated.activeSessionId).toBe('s1') // valid active id is preserved
    const session = migrated.sessions[0]
    // session createdAt (42) is newer than its task (7) → session.updatedAt = 42
    expect(session).toMatchObject({ id: 's1', name: 'Legacy', createdAt: 42, updatedAt: 42, deletedAt: null })
    const task = session.tasks[0]
    expect(task).toMatchObject({ id: 't1', createdAt: 7, updatedAt: 7, deletedAt: null })
  })
  it('migrateSessions backfills session.updatedAt from the NEWEST task when a task is newer', () => {
    const v1 = {
      sessions: [
        {
          id: 's1',
          name: 'Legacy',
          createdAt: 10,
          tasks: [
            { id: 't1', kind: 'translate', title: 'a', sourceText: 'a', resultText: '', createdAt: 20 },
            { id: 't2', kind: 'polish', title: 'b', sourceText: 'b', resultText: '', createdAt: 35 },
          ],
        },
      ],
      activeSessionId: 's1',
    }
    const migrated = migrateSessions(v1, 1) as { sessions: Session[] }
    expect(migrated.sessions[0].updatedAt).toBe(35) // max(10, 20, 35)
  })
  it('migrateSessions v1 → v2: empty sessions array yields an empty, null-active store', () => {
    expect(migrateSessions({ sessions: [], activeSessionId: null }, 1)).toEqual({ sessions: [], activeSessionId: null })
  })
  it('migrateSessions v1 → v2: a session with zero tasks keeps updatedAt=createdAt and an empty task list', () => {
    const migrated = migrateSessions(
      { sessions: [{ id: 's1', name: 'Empty', createdAt: 99, tasks: [] }], activeSessionId: 's1' },
      1,
    ) as { sessions: Session[] }
    expect(migrated.sessions[0]).toMatchObject({ updatedAt: 99, tasks: [] })
  })
  it('migrateSessions v1 → v2: a session missing its tasks array degrades to no tasks (salvaged, not discarded)', () => {
    const migrated = migrateSessions(
      { sessions: [{ id: 's1', name: 'NoTasks', createdAt: 5 }], activeSessionId: 's1' },
      1,
    ) as { sessions: Session[] }
    expect(migrated.sessions).toHaveLength(1)
    expect(migrated.sessions[0]).toMatchObject({ id: 's1', updatedAt: 5, deletedAt: null, tasks: [] })
  })
  it('migrateSessions v1 → v2: a non-array sessions field is too broken to salvage → undefined → defaults', () => {
    expect(migrateSessions({ sessions: 'nope', activeSessionId: null }, 1)).toBeUndefined()
    expect(migrateSessions({ activeSessionId: null }, 1)).toBeUndefined()
  })
  it('migrateSessions v1 → v2: a non-object top level is too broken to salvage → undefined (never throws)', () => {
    expect(migrateSessions(null, 1)).toBeUndefined()
    expect(migrateSessions(undefined, 1)).toBeUndefined()
    expect(migrateSessions(42, 1)).toBeUndefined()
  })
  it('migrateSessions v1 → v2: a null/garbage session entry is skipped, the rest are salvaged (never throws)', () => {
    const migrated = migrateSessions(
      { sessions: [null, { id: 's1', name: 'Good', createdAt: 3, tasks: [] }, 7], activeSessionId: 's1' },
      1,
    ) as { sessions: Session[] }
    expect(migrated.sessions).toHaveLength(1)
    expect(migrated.sessions[0]).toMatchObject({ id: 's1', name: 'Good' })
  })
  it('migrateSessions v1 → v2: a null/garbage task entry is skipped, valid tasks survive (never throws)', () => {
    const migrated = migrateSessions(
      {
        sessions: [
          {
            id: 's1',
            name: 'A',
            createdAt: 1,
            tasks: [null, { id: 't1', kind: 'translate', title: 'ok', sourceText: 'ok', resultText: '', createdAt: 9 }],
          },
        ],
        activeSessionId: 's1',
      },
      1,
    ) as { sessions: Session[] }
    expect(migrated.sessions[0].tasks).toHaveLength(1)
    expect(migrated.sessions[0].tasks[0]).toMatchObject({ id: 't1', updatedAt: 9, deletedAt: null })
  })
  it('migrateSessions v1 → v2: a dangling activeSessionId (no matching session) is dropped to null', () => {
    const migrated = migrateSessions(
      { sessions: [{ id: 's1', name: 'A', createdAt: 1, tasks: [] }], activeSessionId: 'ghost' },
      1,
    ) as { activeSessionId: string | null }
    expect(migrated.activeSessionId).toBeNull()
  })
  it('partializeSessions persists only the sessions + activeSessionId slice (no derived/transient fields)', () => {
    // Call with a genuine SessionState (the live store) — no cast — and assert it narrows to exactly two keys.
    const id = useSessionStore.getState().newSession()
    const persisted = partializeSessions(useSessionStore.getState())
    expect(Object.keys(persisted).sort()).toEqual(['activeSessionId', 'sessions'])
    expect(persisted.activeSessionId).toBe(id)
    expect(persisted.sessions).toBe(useSessionStore.getState().sessions)
  })
})

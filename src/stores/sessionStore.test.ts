import { describe, it, expect, beforeEach } from 'vitest'

import {
  useSessionStore,
  searchSessions,
  __setSessionClock,
  __resetSessionIds,
  __useRandomSessionIds,
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

  it('addTask stores the optional read-view metadata when provided (feature #25)', () => {
    useSessionStore.getState().newSession()
    useSessionStore.getState().addTask({
      kind: 'translate',
      title: 'Hi',
      sourceText: 'Hi',
      resultText: '你好',
      sourceLang: 'en',
      targetLang: 'zh',
      durationMs: 1500,
      keywords: ['inference', 'latency'],
    })
    const task = useSessionStore.getState().sessions[0].tasks[0]
    expect(task).toMatchObject({ sourceLang: 'en', targetLang: 'zh', durationMs: 1500, keywords: ['inference', 'latency'] })
  })

  it('addTask omits the optional metadata cleanly when not provided (old tasks degrade)', () => {
    useSessionStore.getState().newSession()
    useSessionStore.getState().addTask({ kind: 'translate', title: 'Hi', sourceText: 'Hi', resultText: '你好' })
    const task = useSessionStore.getState().sessions[0].tasks[0]
    expect(task.sourceLang).toBeUndefined()
    expect(task.targetLang).toBeUndefined()
    expect(task.durationMs).toBeUndefined()
    expect(task.keywords).toBeUndefined()
    expect('sourceLang' in task).toBe(false) // omitted, not present-as-undefined
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

describe('session id uniqueness (bug #55)', () => {
  it('mints collision-free session ids across reloads — production uses crypto.randomUUID, not a resettable counter', () => {
    // Production never resets an id counter; simulate two app loads via the prod-generator seam.
    __useRandomSessionIds()
    const first = useSessionStore.getState().newSession()
    __useRandomSessionIds() // a reload re-initializes the generator
    const afterReload = useSessionStore.getState().newSession()
    expect(afterReload).not.toBe(first) // the counter bug re-issued 's1' here → collision
    expect(first).toMatch(/^s_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) // s_ + v4 uuid
  })

  it('mints collision-free task ids in production too', () => {
    __useRandomSessionIds()
    useSessionStore.getState().newSession()
    useSessionStore.getState().addTask({ kind: 'translate', title: 'x', sourceText: 'x', resultText: 'y' })
    useSessionStore.getState().addTask({ kind: 'polish', title: 'y', sourceText: 'y', resultText: 'z' })
    const tasks = useSessionStore.getState().sessions[0].tasks
    expect(tasks[0].id).not.toBe(tasks[1].id)
    expect(tasks[0].id).toMatch(/^t_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) // t_ + v4 uuid
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

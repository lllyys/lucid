import { describe, it, expect, beforeEach } from 'vitest'

import {
  useSessionStore,
  migrateSessions,
  partializeSessions,
  __setSessionClock,
  __resetSessionIds,
  type Session,
} from './sessionStore'

let t = 1000
beforeEach(() => {
  __resetSessionIds()
  t = 1000
  __setSessionClock(() => ++t)
  useSessionStore.getState().reset()
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
  it.each([
    { desc: 'non-string id', session: { id: 1, name: 'A', createdAt: 1, tasks: [] } },
    { desc: 'non-string name', session: { id: 's1', name: 2, createdAt: 1, tasks: [] } },
    { desc: 'non-number createdAt', session: { id: 's1', name: 'A', createdAt: 'x', tasks: [] } },
  ])('migrateSessions v1 → v2: skips a session with $desc (would crash searchSessions otherwise)', ({ session }) => {
    const migrated = migrateSessions(
      { sessions: [session, { id: 's2', name: 'OK', createdAt: 5, tasks: [] }], activeSessionId: 's2' },
      1,
    ) as { sessions: Session[] }
    expect(migrated.sessions.map((s) => s.id)).toEqual(['s2'])
  })
  it.each([
    { desc: 'non-string id', task: { id: 1, kind: 'translate', title: 'a', sourceText: 'a', resultText: '', createdAt: 9 } },
    { desc: 'invalid kind', task: { id: 't1', kind: 'summarize', title: 'a', sourceText: 'a', resultText: '', createdAt: 9 } },
    { desc: 'non-string title', task: { id: 't1', kind: 'translate', title: 2, sourceText: 'a', resultText: '', createdAt: 9 } },
    { desc: 'non-string sourceText', task: { id: 't1', kind: 'translate', title: 'a', sourceText: 3, resultText: '', createdAt: 9 } },
    { desc: 'non-string resultText', task: { id: 't1', kind: 'translate', title: 'a', sourceText: 'a', resultText: 4, createdAt: 9 } },
    { desc: 'non-number createdAt', task: { id: 't1', kind: 'translate', title: 'a', sourceText: 'a', resultText: '', createdAt: 'x' } },
  ])('migrateSessions v1 → v2: skips a task with $desc, keeps the valid sibling', ({ task }) => {
    const sibling = { id: 't2', kind: 'polish', title: 'ok', sourceText: 'ok', resultText: '', createdAt: 3 }
    const migrated = migrateSessions(
      { sessions: [{ id: 's1', name: 'A', createdAt: 1, tasks: [task, sibling] }], activeSessionId: 's1' },
      1,
    ) as { sessions: Session[] }
    expect(migrated.sessions[0].tasks.map((t) => t.id)).toEqual(['t2'])
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

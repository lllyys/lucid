import { describe, it, expect, beforeEach } from 'vitest'
import { recordTask } from './recordTask'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'

beforeEach(() => {
  __resetSessionIds()
  useSessionStore.getState().reset()
})

describe('recordTask', () => {
  it('auto-creates an active session when none exists, then records the task', () => {
    recordTask('translate', 'Hello world', '你好世界')
    const sessions = useSessionStore.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tasks).toHaveLength(1)
    expect(sessions[0].tasks[0]).toMatchObject({ kind: 'translate', sourceText: 'Hello world', resultText: '你好世界' })
  })

  it('records into the existing active session (no new session)', () => {
    useSessionStore.getState().newSession()
    recordTask('polish', 'rough draft', 'polished draft')
    expect(useSessionStore.getState().sessions).toHaveLength(1)
    expect(useSessionStore.getState().sessions[0].tasks[0]).toMatchObject({ kind: 'polish' })
  })

  it('derives the title from the first line, trimmed to ≤40 chars', () => {
    recordTask('translate', '  First line here\nsecond line ignored  ', 'r')
    expect(useSessionStore.getState().sessions[0].tasks[0].title).toBe('First line here')
  })

  it('truncates a long single-line title with an ellipsis', () => {
    const long = 'x'.repeat(60)
    recordTask('translate', long, 'r')
    const title = useSessionStore.getState().sessions[0].tasks[0].title
    expect(title).toBe(`${'x'.repeat(40)}…`)
  })

  it('derives an empty title from a whitespace-only source', () => {
    recordTask('polish', '   \n  ', 'result')
    expect(useSessionStore.getState().sessions[0].tasks[0].title).toBe('')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { recordRunIfNew, __resetAutoRecord } from './autoRecord'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'
import type { PanelOp } from '@/stores/operationStore'

const done = (text: string, runId = 1): PanelOp => ({ status: 'done', text, startedAt: 0, elapsedMs: 1, runId })
const tasks = () => useSessionStore.getState().sessions.flatMap((s) => s.tasks)

beforeEach(() => {
  __resetSessionIds()
  useSessionStore.getState().reset()
  __resetAutoRecord()
})

describe('recordRunIfNew (feature #14 — auto-save completed runs)', () => {
  it('records a completed run as a task and returns true', () => {
    expect(recordRunIfNew('translate', done('hola'), 'translate', 'hello')).toBe(true)
    const t = tasks()
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ kind: 'translate', sourceText: 'hello', resultText: 'hola' })
  })

  it.each(['idle', 'streaming', 'error', 'cancelled'] as const)('does NOT record on status=%s', (status) => {
    const op = { status, text: 'x', startedAt: 0, elapsedMs: null, runId: 1 } as unknown as PanelOp
    expect(recordRunIfNew('translate', op, 'translate', 'hello')).toBe(false)
    expect(tasks()).toHaveLength(0)
  })

  it('dedups: a second call with the same (panel, runId) records nothing', () => {
    expect(recordRunIfNew('translate', done('hola', 5), 'translate', 'hello')).toBe(true)
    expect(recordRunIfNew('translate', done('hola', 5), 'translate', 'hello')).toBe(false)
    expect(tasks()).toHaveLength(1)
  })

  it('records again on a new runId', () => {
    recordRunIfNew('translate', done('hola', 1), 'translate', 'hello')
    expect(recordRunIfNew('translate', done('adios', 2), 'translate', 'bye')).toBe(true)
    expect(tasks()).toHaveLength(2)
  })

  it('tracks translate and polish panels independently (same runId, both record)', () => {
    expect(recordRunIfNew('translate', done('hola', 1), 'translate', 'hello')).toBe(true)
    expect(recordRunIfNew('polish', done('polished', 1), 'polish', 'draft')).toBe(true)
    expect(tasks()).toHaveLength(2)
  })

  it('skips an empty/whitespace source', () => {
    expect(recordRunIfNew('translate', done('hola'), 'translate', '   ')).toBe(false)
    expect(tasks()).toHaveLength(0)
  })

  it('skips an empty result (no clean)', () => {
    expect(recordRunIfNew('translate', done(''), 'translate', 'hello')).toBe(false)
    expect(tasks()).toHaveLength(0)
  })

  it('applies cleanResult — stores the cleaned text, not the raw', () => {
    recordRunIfNew('polish', done('PROSE polished'), 'polish', 'draft', (s) => s.replace('PROSE ', ''))
    expect(tasks()[0].resultText).toBe('polished')
  })

  it('skips when cleanResult yields an empty result', () => {
    expect(recordRunIfNew('polish', done('   '), 'polish', 'draft', (s) => s.trim())).toBe(false)
    expect(tasks()).toHaveLength(0)
  })

  it('__resetAutoRecord clears the dedup map (the same runId records again after reset)', () => {
    recordRunIfNew('translate', done('hola', 1), 'translate', 'hello')
    __resetAutoRecord()
    expect(recordRunIfNew('translate', done('hola', 1), 'translate', 'hello')).toBe(true)
    expect(tasks()).toHaveLength(2)
  })
})

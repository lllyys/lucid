import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoRecordTask } from './useAutoRecordTask'
import { useOperationStore } from '@/stores/operationStore'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'
import { __resetAutoRecord } from '@/lib/sessions/autoRecord'

const tasks = () => useSessionStore.getState().sessions.flatMap((s) => s.tasks)
const setDone = (text: string, runId: number) =>
  useOperationStore.setState({ translate: { status: 'done', text, startedAt: 0, elapsedMs: 1, runId, isAuto: false } })

beforeEach(() => {
  __resetSessionIds()
  useSessionStore.getState().reset()
  __resetAutoRecord()
  useOperationStore.setState({ translate: { status: 'idle', startedAt: null, elapsedMs: null, runId: 0, isAuto: false } })
})

describe('useAutoRecordTask', () => {
  it('records a task once the panel op reaches done', () => {
    renderHook(() => useAutoRecordTask('translate', 'translate', 'hello'))
    expect(tasks()).toHaveLength(0) // idle → nothing recorded
    act(() => setDone('hola', 1))
    const t = tasks()
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ kind: 'translate', sourceText: 'hello', resultText: 'hola' })
  })

  it('records the source present at the done transition (freshness)', () => {
    const { rerender } = renderHook(({ src }) => useAutoRecordTask('translate', 'translate', src), {
      initialProps: { src: 'hello' },
    })
    rerender({ src: 'world' }) // source edited while the op is still idle
    act(() => setDone('r', 1))
    expect(tasks()[0].sourceText).toBe('world')
  })

  it('does not double-record when the same done runId is re-applied', () => {
    renderHook(() => useAutoRecordTask('translate', 'translate', 'hello'))
    act(() => setDone('hola', 1))
    act(() => setDone('hola', 1)) // a new op object, same runId → effect re-runs → deduped
    expect(tasks()).toHaveLength(1)
  })

  it('threads the meta (langs/keywords) into the recorded task (feature #25)', () => {
    renderHook(() => useAutoRecordTask('translate', 'translate', 'hello', undefined, { sourceLang: 'en', targetLang: 'zh' }))
    act(() => setDone('hola', 1))
    expect(tasks()[0]).toMatchObject({ sourceLang: 'en', targetLang: 'zh' })
  })

  it('records keywords once and does not double-record on a fresh keywords array reference (dep hygiene)', () => {
    const { rerender } = renderHook(({ kw }) => useAutoRecordTask('translate', 'polish', 'draft', undefined, { keywords: kw }), {
      initialProps: { kw: ['api'] },
    })
    act(() => setDone('polished', 1))
    expect(tasks()).toHaveLength(1)
    rerender({ kw: ['api'] }) // same values, fresh array reference — must not re-record (deduped anyway)
    expect(tasks()).toHaveLength(1)
    expect(tasks()[0].keywords).toEqual(['api'])
  })
})

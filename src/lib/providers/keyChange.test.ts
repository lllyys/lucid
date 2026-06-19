import { describe, it, expect, beforeEach } from 'vitest'
import { applyKeyChange } from './keyChange'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore, type PanelId, type PanelOp } from '@/stores/operationStore'
import { makeProviderError } from '@/providers/errors'

const streaming = (text = 'partial'): PanelOp => ({ status: 'streaming', text, startedAt: 0, elapsedMs: null, runId: 1, isAuto: false })
const invalid = (): PanelOp => ({ status: 'error', text: '', error: makeProviderError('invalidKey'), startedAt: null, elapsedMs: null, runId: 1, isAuto: false })
const done = (): PanelOp => ({ status: 'done', text: 'x', startedAt: 0, elapsedMs: 1, runId: 1, isAuto: false })

beforeEach(() => {
  useProviderStore.getState().reset()
  const ops = useOperationStore.getState()
  ;(['translate', 'polish', 'draftTranslate'] as PanelId[]).forEach((p) => ops.reset(p))
})

describe('applyKeyChange', () => {
  it('is a no-op when the key is unchanged (touches no panel)', () => {
    useProviderStore.getState().setApiKey('sk-ant-keep-this-1234')
    useOperationStore.setState({ translate: streaming() })
    applyKeyChange('sk-ant-keep-this-1234')
    expect(useOperationStore.getState().translate.status).toBe('streaming')
    expect(useProviderStore.getState().apiKey).toBe('sk-ant-keep-this-1234')
  })

  it('aborts a streaming panel and saves the new key when changed', () => {
    useProviderStore.getState().setApiKey('sk-ant-old-000000000')
    useOperationStore.setState({ polish: streaming() })
    applyKeyChange('sk-ant-new-111111111')
    expect(useOperationStore.getState().polish.status).toBe('cancelled')
    expect(useProviderStore.getState().apiKey).toBe('sk-ant-new-111111111')
  })

  it('resets a panel stuck in invalidKey so the rejected state clears', () => {
    useProviderStore.getState().setApiKey('sk-ant-bad-000000000')
    useOperationStore.setState({ translate: invalid() })
    applyKeyChange('sk-ant-good-22222222')
    expect(useOperationStore.getState().translate.status).toBe('idle')
  })

  it('leaves idle/done panels untouched on a key change', () => {
    useProviderStore.getState().setApiKey('sk-ant-old-000000000')
    useOperationStore.setState({ translate: done() })
    applyKeyChange('sk-ant-new-111111111')
    expect(useOperationStore.getState().translate.status).toBe('done')
  })

  it('clears the key (and readiness) when changed to empty', () => {
    useProviderStore.getState().setApiKey('sk-ant-old-000000000')
    applyKeyChange('')
    expect(useProviderStore.getState().apiKey).toBe('')
    expect(useProviderStore.getState().isReady()).toBe(false)
  })
})

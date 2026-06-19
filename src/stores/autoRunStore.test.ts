import { describe, it, expect, beforeEach } from 'vitest'
import {
  useAutoRunStore,
  partializeAutoRun,
  mergeAutoRun,
  migrateAutoRun,
  AUTORUN_PERSIST_KEY,
  AUTORUN_PERSIST_VERSION,
} from './autoRunStore'

beforeEach(() => {
  useAutoRunStore.getState().reset()
})

describe('autoRunStore — defaults', () => {
  it('is off for every panel by default', () => {
    const s = useAutoRunStore.getState()
    expect(s.enabled.translate).toBe(false)
    expect(s.enabled.polish).toBe(false)
  })

  it('has no cost acknowledgment for any vendor by default', () => {
    const s = useAutoRunStore.getState()
    expect(s.costAck.anthropic).toBe(false)
    expect(s.costAck.openai).toBe(false)
    expect(s.costAck.gemini).toBe(false)
    expect(s.costAck.ollama).toBe(false)
    expect(s.costAck.custom).toBe(false)
  })
})

describe('autoRunStore — toggle per panel', () => {
  it('setEnabled turns a single panel on without touching the other', () => {
    useAutoRunStore.getState().setEnabled('translate', true)
    expect(useAutoRunStore.getState().enabled.translate).toBe(true)
    expect(useAutoRunStore.getState().enabled.polish).toBe(false)
  })

  it('setEnabled can turn a panel back off', () => {
    useAutoRunStore.getState().setEnabled('polish', true)
    useAutoRunStore.getState().setEnabled('polish', false)
    expect(useAutoRunStore.getState().enabled.polish).toBe(false)
  })
})

describe('autoRunStore — cost acknowledgment per vendor', () => {
  it('ackCost records a one-time hosted acknowledgment for a single vendor', () => {
    useAutoRunStore.getState().ackCost('openai')
    expect(useAutoRunStore.getState().costAck.openai).toBe(true)
    expect(useAutoRunStore.getState().costAck.anthropic).toBe(false)
  })
})

describe('autoRunStore — persistence (no secrets, separate key)', () => {
  it('persists under its own lucid.autorun key, separate from the provider store', () => {
    expect(AUTORUN_PERSIST_KEY).toBe('lucid.autorun')
    expect(AUTORUN_PERSIST_KEY).not.toBe('lucid.provider')
  })

  it('partialize persists only enabled + costAck (no other fields, no secrets)', () => {
    useAutoRunStore.getState().setEnabled('translate', true)
    useAutoRunStore.getState().ackCost('anthropic')
    const persisted = partializeAutoRun(useAutoRunStore.getState())
    expect(Object.keys(persisted).sort()).toEqual(['costAck', 'enabled'])
    expect(persisted.enabled.translate).toBe(true)
    expect(persisted.costAck.anthropic).toBe(true)
  })

  it('merge rehydrates a valid persisted blob over the defaults', () => {
    const current = useAutoRunStore.getState()
    const merged = mergeAutoRun(
      { enabled: { translate: true, polish: false }, costAck: { openai: true } },
      current,
    )
    expect(merged.enabled.translate).toBe(true)
    expect(merged.enabled.polish).toBe(false)
    expect(merged.costAck.openai).toBe(true)
    expect(merged.costAck.anthropic).toBe(false) // untouched key stays default
    expect(typeof merged.setEnabled).toBe('function') // actions preserved
  })

  it('merge applies only the keys present in a partial blob, leaving the rest at default', () => {
    const current = useAutoRunStore.getState()
    const merged = mergeAutoRun({ enabled: { translate: true }, costAck: { openai: true } }, current)
    expect(merged.enabled.translate).toBe(true)
    expect(merged.enabled.polish).toBe(false) // absent key → default
    expect(merged.costAck.openai).toBe(true)
    expect(merged.costAck.anthropic).toBe(false) // absent key → default
  })

  it('merge tolerates a blob whose enabled / costAck themselves are not objects', () => {
    const current = useAutoRunStore.getState()
    const merged = mergeAutoRun({ enabled: 'nope', costAck: 5 }, current)
    expect(merged.enabled.translate).toBe(false)
    expect(merged.costAck.openai).toBe(false)
  })

  it('merge ignores a corrupt / non-object persisted blob (→ current defaults)', () => {
    const current = useAutoRunStore.getState()
    expect(mergeAutoRun(null, current)).toBe(current)
    expect(mergeAutoRun('garbage', current)).toBe(current)
    expect(mergeAutoRun(42, current)).toBe(current)
  })

  it('merge ignores non-boolean / unknown values in the persisted blob', () => {
    const current = useAutoRunStore.getState()
    const merged = mergeAutoRun(
      {
        enabled: { translate: 'yes', polish: 1, bogusPanel: true },
        costAck: { openai: 'truthy', notAVendor: true },
      },
      current,
    )
    // non-boolean values are dropped → defaults retained
    expect(merged.enabled.translate).toBe(false)
    expect(merged.enabled.polish).toBe(false)
    expect(merged.costAck.openai).toBe(false)
    // unknown keys never appear
    expect('bogusPanel' in merged.enabled).toBe(false)
    expect('notAVendor' in merged.costAck).toBe(false)
  })

  it('migrate passes the blob through on the current version and drops any other version', () => {
    const blob = { enabled: { translate: true } }
    expect(migrateAutoRun(blob, AUTORUN_PERSIST_VERSION)).toBe(blob)
    expect(migrateAutoRun(blob, AUTORUN_PERSIST_VERSION + 1)).toBeUndefined()
    expect(migrateAutoRun(blob, 0)).toBeUndefined()
  })

  it('reset returns to all-off / no-ack', () => {
    useAutoRunStore.getState().setEnabled('translate', true)
    useAutoRunStore.getState().ackCost('openai')
    useAutoRunStore.getState().reset()
    const s = useAutoRunStore.getState()
    expect(s.enabled.translate).toBe(false)
    expect(s.costAck.openai).toBe(false)
  })
})

// WI-1 — providerStore v1→v2 migration + open-keyed defensive merge of persisted custom providers.
import { describe, it, expect } from 'vitest'
import {
  migrateProviderV1toV2,
  sanitizeCustomProviders,
  pickActiveCustomId,
  MAX_CUSTOM_PROVIDERS,
} from './providerStoreMigrate'

describe('migrateProviderV1toV2', () => {
  it('passes through a v2 blob unchanged at the current version', () => {
    const v2 = { vendor: 'anthropic', models: {}, baseUrl: '', customProviders: {}, activeCustomId: null }
    expect(migrateProviderV1toV2(v2, 2)).toBe(v2)
  })

  it('carries a v1 single-custom config forward into ONE active custom entry', () => {
    const v1 = { vendor: 'custom', models: { custom: 'my-model' }, baseUrl: 'https://x/v1' }
    const out = migrateProviderV1toV2(v1, 1) as Record<string, unknown>
    const customs = out.customProviders as Record<string, { id: string; label: string; baseUrl: string; model: string }>
    const ids = Object.keys(customs)
    expect(ids).toHaveLength(1)
    const entry = customs[ids[0]]
    expect(entry).toMatchObject({ id: ids[0], label: 'Custom', baseUrl: 'https://x/v1', model: 'my-model' })
    expect(out.activeCustomId).toBe(ids[0]) // v1 vendor was 'custom' → activated
    // the v1 scalar fields ride along untouched (the merge re-derives the mirror)
    expect(out.vendor).toBe('custom')
    expect(out.baseUrl).toBe('https://x/v1')
  })

  it('a v1 non-custom vendor with a stray baseUrl gets an INACTIVE custom (activeCustomId stays null)', () => {
    const v1 = { vendor: 'anthropic', models: { custom: 'm' }, baseUrl: 'https://stray/v1' }
    const out = migrateProviderV1toV2(v1, 1) as Record<string, unknown>
    const customs = out.customProviders as Record<string, unknown>
    expect(Object.keys(customs)).toHaveLength(1)
    expect(out.activeCustomId).toBeNull()
  })

  it('defaults the entry model to "" when v1 has no models.custom', () => {
    const v1 = { vendor: 'custom', models: {}, baseUrl: 'https://x/v1' }
    const out = migrateProviderV1toV2(v1, 1) as Record<string, unknown>
    const customs = out.customProviders as Record<string, { model: string }>
    expect(Object.values(customs)[0].model).toBe('')
  })

  it('a v1 blob with an empty baseUrl produces NO custom entries', () => {
    const v1 = { vendor: 'anthropic', models: {}, baseUrl: '' }
    const out = migrateProviderV1toV2(v1, 1) as Record<string, unknown>
    expect(out.customProviders).toEqual({})
    expect(out.activeCustomId).toBeNull()
  })

  it('treats a v1 non-string baseUrl as empty (no entry)', () => {
    const v1 = { vendor: 'custom', models: {}, baseUrl: 42 }
    const out = migrateProviderV1toV2(v1, 1) as Record<string, unknown>
    expect(out.customProviders).toEqual({})
    expect(out.activeCustomId).toBeNull()
  })

  it('a v1 non-object blob still upgrades to an empty v2 shape (does not throw)', () => {
    const out = migrateProviderV1toV2(null, 1) as Record<string, unknown>
    expect(out.customProviders).toEqual({})
    expect(out.activeCustomId).toBeNull()
  })

  it('drops an unknown future version (returns undefined → persist rehydrates defaults)', () => {
    expect(migrateProviderV1toV2({ vendor: 'custom' }, 99)).toBeUndefined()
  })
})

describe('sanitizeCustomProviders (open-keyed defensive rehydrate)', () => {
  const good = (id: string) => ({ id, label: `L${id}`, baseUrl: `https://${id}/v1`, model: 'm' })

  it('keeps a well-formed entry and FORCES key="" + testResult idle (never rehydrated — rule 65 §5)', () => {
    const blob = { a: { ...good('a'), key: 'sk-leak', testResult: { status: 'ok', latencyMs: 5 } } }
    const out = sanitizeCustomProviders(blob)
    expect(out.a).toEqual({ id: 'a', label: 'La', baseUrl: 'https://a/v1', model: 'm', key: '', testResult: { status: 'idle' } })
    expect(JSON.stringify(out)).not.toContain('sk-leak')
    expect(JSON.stringify(out)).not.toContain('"ok"')
  })

  it('returns {} for a non-object input', () => {
    expect(sanitizeCustomProviders(null)).toEqual({})
    expect(sanitizeCustomProviders('str')).toEqual({})
    expect(sanitizeCustomProviders(42)).toEqual({})
  })

  it('returns {} for an array (arrays pass isRecord but are not a custom map)', () => {
    expect(sanitizeCustomProviders([good('a')])).toEqual({})
  })

  it('skips prototype-pollution keys (__proto__/constructor/prototype) without polluting', () => {
    const blob = JSON.parse('{"__proto__":{"polluted":true},"constructor":{},"prototype":{},"safe":' + JSON.stringify(good('safe')) + '}')
    const out = sanitizeCustomProviders(blob)
    expect(Object.keys(out)).toEqual(['safe'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('drops an entry whose id does not equal its key', () => {
    const out = sanitizeCustomProviders({ k1: good('different-id') })
    expect(out).toEqual({})
  })

  it('drops entries with a missing or non-string field', () => {
    const out = sanitizeCustomProviders({
      a: { id: 'a', label: 'La', baseUrl: 'u', model: 'm' }, // ok
      b: { id: 'b', label: 42, baseUrl: 'u', model: 'm' }, // bad label
      c: { id: 'c', baseUrl: 'u', model: 'm' }, // missing label
      d: { id: 'd', label: 'Ld', baseUrl: 'u' }, // missing model
      e: 'not-an-object',
    })
    expect(Object.keys(out)).toEqual(['a'])
  })

  it('caps the count at MAX_CUSTOM_PROVIDERS (DoS guard)', () => {
    const blob: Record<string, unknown> = {}
    for (let i = 0; i < MAX_CUSTOM_PROVIDERS + 25; i++) blob[`id${i}`] = good(`id${i}`)
    const out = sanitizeCustomProviders(blob)
    expect(Object.keys(out)).toHaveLength(MAX_CUSTOM_PROVIDERS)
  })
})

describe('pickActiveCustomId', () => {
  const customs = { a: { id: 'a', label: 'A', baseUrl: 'u', model: 'm', key: '', testResult: { status: 'idle' as const } } }

  it('keeps a valid activeCustomId that points at an existing entry', () => {
    expect(pickActiveCustomId('a', customs)).toBe('a')
  })
  it('nulls a dangling activeCustomId (points at a removed/absent entry)', () => {
    expect(pickActiveCustomId('ghost', customs)).toBeNull()
  })
  it('nulls a non-string activeCustomId', () => {
    expect(pickActiveCustomId(42, customs)).toBeNull()
    expect(pickActiveCustomId(null, customs)).toBeNull()
    expect(pickActiveCustomId(undefined, customs)).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { serializeConfig, parseConfig, type SyncableConfig } from './providerConfigCodec'
import type { CustomProvider } from '@/stores/providerStoreMigrate'

/** Build a full custom-provider entry (incl. key + testResult) for the round-trip fixtures. */
function custom(over: Partial<CustomProvider> & { id: string }): CustomProvider {
  return {
    id: over.id,
    label: over.label ?? 'DeepSeek',
    baseUrl: over.baseUrl ?? 'https://api.deepseek.com/v1',
    model: over.model ?? 'deepseek-chat',
    key: over.key ?? 'sk-DEEPSEEK-SECRET',
    testResult: over.testResult ?? { status: 'idle' },
  }
}

const CONFIG: SyncableConfig = {
  vendor: 'custom',
  models: { custom: 'gpt-4o-mini', anthropic: 'claude-fable-5' },
  baseUrl: 'https://api.example.com/v1',
  apiKeys: { custom: 'sk-secret', anthropic: '' },
  customProviders: { c1: custom({ id: 'c1' }) },
  activeCustomId: 'c1',
}

describe('providerConfigCodec', () => {
  it('round-trips the config (incl. apiKeys AND custom providers with keys) through serialize → parse', () => {
    expect(parseConfig(serializeConfig(CONFIG))).toEqual(CONFIG)
  })

  it('carries each custom provider`s API key inside the serialized plaintext (the whole point — keys ride the ciphertext)', () => {
    // The key is the very thing #15 exists to sync; it MUST be present in serializeConfig output (which
    // configCrypto then encrypts) — unlike the localStorage path, which strips keys.
    const json = serializeConfig(CONFIG)
    expect(json).toContain('sk-DEEPSEEK-SECRET')
    const parsed = parseConfig(json)!
    expect(parsed.customProviders.c1.key).toBe('sk-DEEPSEEK-SECRET')
  })

  it('serializes a v2 envelope with ONLY the defined keys (no stray fields)', () => {
    const env = JSON.parse(serializeConfig(CONFIG))
    expect(env).toMatchObject({ v: 2, vendor: 'custom' })
    expect(Object.keys(env).sort()).toEqual([
      'activeCustomId',
      'apiKeys',
      'baseUrl',
      'customProviders',
      'models',
      'v',
      'vendor',
    ])
  })

  it('drops an array supplied where a vendor map is expected (arrays pass isRecord)', () => {
    const raw = JSON.stringify({
      v: 2,
      vendor: 'custom',
      models: ['a', 'b'],
      baseUrl: '',
      apiKeys: {},
      customProviders: {},
      activeCustomId: null,
    })
    expect(parseConfig(raw)).toEqual({
      vendor: 'custom',
      models: {},
      baseUrl: '',
      apiKeys: {},
      customProviders: {},
      activeCustomId: null,
    })
  })

  it.each([
    ['not json', 'this is not json{'],
    ['a json non-object', '"a string"'],
    ['a json array', '[1,2,3]'],
    ['unknown future version', JSON.stringify({ v: 3, vendor: 'custom', models: {}, baseUrl: '', apiKeys: {} })],
    ['missing vendor', JSON.stringify({ v: 2, models: {}, baseUrl: '', apiKeys: {} })],
    ['non-string vendor', JSON.stringify({ v: 2, vendor: 42, models: {}, baseUrl: '', apiKeys: {} })],
  ])('returns null for %s', (_label, input) => {
    expect(parseConfig(input)).toBeNull()
  })

  it('sanitizes non-string model/apiKey entries and a non-string baseUrl (skip-bad-fields)', () => {
    const raw = JSON.stringify({
      v: 2,
      vendor: 'custom',
      models: { custom: 'm', openai: 123, gemini: null },
      baseUrl: 999,
      apiKeys: { custom: 'k', anthropic: { nested: 'x' } },
    })
    expect(parseConfig(raw)).toEqual({
      vendor: 'custom',
      models: { custom: 'm' },
      baseUrl: '',
      apiKeys: { custom: 'k' },
      customProviders: {},
      activeCustomId: null,
    })
  })

  it('drops prototype-pollution keys in the maps (__proto__/constructor/prototype)', () => {
    const raw = JSON.stringify({
      v: 2,
      vendor: 'custom',
      models: { custom: 'm', __proto__: 'evil', constructor: 'evil', prototype: 'evil' },
      baseUrl: '',
      apiKeys: {},
    })
    const parsed = parseConfig(raw)!
    expect(parsed.models).toEqual({ custom: 'm' })
    expect(Object.getPrototypeOf(parsed.models)).toBe(Object.prototype) // not polluted
  })

  it('handles missing maps (defaults to empty) and an empty config', () => {
    const raw = JSON.stringify({ v: 2, vendor: 'anthropic' })
    expect(parseConfig(raw)).toEqual({
      vendor: 'anthropic',
      models: {},
      baseUrl: '',
      apiKeys: {},
      customProviders: {},
      activeCustomId: null,
    })
  })

  describe('v1 → v2 backward-compat migration', () => {
    it('an old v1 blob (no customProviders) parses to empty customProviders + null activeCustomId', () => {
      const v1 = JSON.stringify({
        v: 1,
        vendor: 'custom',
        models: { custom: 'gpt-4o-mini' },
        baseUrl: 'https://api.example.com/v1',
        apiKeys: { custom: 'sk-old' },
      })
      expect(parseConfig(v1)).toEqual({
        vendor: 'custom',
        models: { custom: 'gpt-4o-mini' },
        baseUrl: 'https://api.example.com/v1',
        apiKeys: { custom: 'sk-old' },
        customProviders: {},
        activeCustomId: null,
      })
    })

    it('a v1 blob ignores any stray customProviders/activeCustomId (they did not exist at v1)', () => {
      const v1 = JSON.stringify({
        v: 1,
        vendor: 'anthropic',
        models: {},
        baseUrl: '',
        apiKeys: {},
        customProviders: { c1: custom({ id: 'c1' }) },
        activeCustomId: 'c1',
      })
      expect(parseConfig(v1)).toEqual({
        vendor: 'anthropic',
        models: {},
        baseUrl: '',
        apiKeys: {},
        customProviders: {},
        activeCustomId: null,
      })
    })
  })

  describe('defensive sanitize of the custom-provider map (decrypted but untrusted)', () => {
    it('skips prototype-pollution keys (__proto__/constructor/prototype) in customProviders', () => {
      const raw = JSON.stringify({
        v: 2,
        vendor: 'custom',
        customProviders: {
          c1: custom({ id: 'c1' }),
          __proto__: custom({ id: '__proto__' }),
          constructor: custom({ id: 'constructor' }),
          prototype: custom({ id: 'prototype' }),
        },
        activeCustomId: 'c1',
      })
      const parsed = parseConfig(raw)!
      expect(Object.keys(parsed.customProviders)).toEqual(['c1'])
      expect(Object.getPrototypeOf(parsed.customProviders)).toBe(Object.prototype)
    })

    it('drops a malformed entry: non-object, missing/non-string fields, or id !== key', () => {
      const raw = JSON.stringify({
        v: 2,
        vendor: 'custom',
        customProviders: {
          good: custom({ id: 'good' }),
          notObject: 'nope',
          badId: { id: 'mismatch', label: 'X', baseUrl: 'u', model: 'm', key: 'k' }, // id !== its key
          missingLabel: { id: 'missingLabel', baseUrl: 'u', model: 'm', key: 'k' },
          nonStringModel: { id: 'nonStringModel', label: 'X', baseUrl: 'u', model: 5, key: 'k' },
          nonStringKey: { id: 'nonStringKey', label: 'X', baseUrl: 'u', model: 'm', key: 5 },
        },
        activeCustomId: 'good',
      })
      const parsed = parseConfig(raw)!
      expect(Object.keys(parsed.customProviders)).toEqual(['good'])
      expect(parsed.customProviders.good.key).toBe('sk-DEEPSEEK-SECRET')
    })

    it('defaults each rehydrated entry`s testResult to idle (never carried from the blob)', () => {
      const raw = JSON.stringify({
        v: 2,
        vendor: 'custom',
        customProviders: {
          c1: { id: 'c1', label: 'X', baseUrl: 'u', model: 'm', key: 'k', testResult: { status: 'ok', latencyMs: 9 } },
        },
        activeCustomId: 'c1',
      })
      expect(parseConfig(raw)!.customProviders.c1.testResult).toEqual({ status: 'idle' })
    })

    it('caps the custom map at 50 entries (DoS guard against a hostile blob)', () => {
      const customProviders: Record<string, unknown> = {}
      for (let i = 0; i < 60; i++) customProviders[`c${i}`] = custom({ id: `c${i}` })
      const raw = JSON.stringify({ v: 2, vendor: 'custom', customProviders, activeCustomId: 'c0' })
      expect(Object.keys(parseConfig(raw)!.customProviders)).toHaveLength(50)
    })

    it('drops customProviders supplied as an array (arrays pass isRecord)', () => {
      const raw = JSON.stringify({ v: 2, vendor: 'custom', customProviders: [custom({ id: 'c1' })], activeCustomId: null })
      expect(parseConfig(raw)!.customProviders).toEqual({})
    })

    it.each([
      ['a non-string activeCustomId', 42],
      ['a dangling activeCustomId (no matching entry)', 'missing'],
      ['a null activeCustomId', null],
    ])('nulls %s', (_label, active) => {
      const raw = JSON.stringify({
        v: 2,
        vendor: 'custom',
        customProviders: { c1: custom({ id: 'c1' }) },
        activeCustomId: active,
      })
      expect(parseConfig(raw)!.activeCustomId).toBeNull()
    })

    it('keeps a valid activeCustomId that points at a surviving entry', () => {
      const raw = JSON.stringify({
        v: 2,
        vendor: 'custom',
        customProviders: { c1: custom({ id: 'c1' }) },
        activeCustomId: 'c1',
      })
      expect(parseConfig(raw)!.activeCustomId).toBe('c1')
    })
  })
})

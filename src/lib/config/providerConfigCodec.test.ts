import { describe, it, expect } from 'vitest'
import { serializeConfig, parseConfig, type SyncableConfig } from './providerConfigCodec'

const CONFIG: SyncableConfig = {
  vendor: 'custom',
  models: { custom: 'gpt-4o-mini', anthropic: 'claude-fable-5' },
  baseUrl: 'https://api.example.com/v1',
  apiKeys: { custom: 'sk-secret', anthropic: '' },
}

describe('providerConfigCodec', () => {
  it('round-trips the config (incl. apiKeys) through serialize → parse', () => {
    expect(parseConfig(serializeConfig(CONFIG))).toEqual(CONFIG)
  })

  it('serializes a versioned envelope with ONLY the defined keys (no stray fields)', () => {
    const env = JSON.parse(serializeConfig(CONFIG))
    expect(env).toMatchObject({ v: 1, vendor: 'custom' })
    expect(Object.keys(env).sort()).toEqual(['apiKeys', 'baseUrl', 'models', 'v', 'vendor'])
  })

  it('drops an array supplied where a vendor map is expected (arrays pass isRecord)', () => {
    const raw = JSON.stringify({ v: 1, vendor: 'custom', models: ['a', 'b'], baseUrl: '', apiKeys: {} })
    expect(parseConfig(raw)).toEqual({ vendor: 'custom', models: {}, baseUrl: '', apiKeys: {} })
  })

  it.each([
    ['not json', 'this is not json{'],
    ['a json non-object', '"a string"'],
    ['a json array', '[1,2,3]'],
    ['wrong version', JSON.stringify({ v: 2, vendor: 'custom', models: {}, baseUrl: '', apiKeys: {} })],
    ['missing vendor', JSON.stringify({ v: 1, models: {}, baseUrl: '', apiKeys: {} })],
    ['non-string vendor', JSON.stringify({ v: 1, vendor: 42, models: {}, baseUrl: '', apiKeys: {} })],
  ])('returns null for %s', (_label, input) => {
    expect(parseConfig(input)).toBeNull()
  })

  it('sanitizes non-string model/apiKey entries and a non-string baseUrl (skip-bad-fields)', () => {
    const raw = JSON.stringify({
      v: 1,
      vendor: 'custom',
      models: { custom: 'm', openai: 123, gemini: null },
      baseUrl: 999,
      apiKeys: { custom: 'k', anthropic: { nested: 'x' } },
    })
    expect(parseConfig(raw)).toEqual({ vendor: 'custom', models: { custom: 'm' }, baseUrl: '', apiKeys: { custom: 'k' } })
  })

  it('drops prototype-pollution keys in the maps (__proto__/constructor/prototype)', () => {
    const raw = JSON.stringify({
      v: 1,
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
    const raw = JSON.stringify({ v: 1, vendor: 'anthropic' })
    expect(parseConfig(raw)).toEqual({ vendor: 'anthropic', models: {}, baseUrl: '', apiKeys: {} })
  })
})

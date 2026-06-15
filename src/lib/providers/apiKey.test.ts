import { describe, it, expect } from 'vitest'
import { maskKey, validateKeyShape } from './apiKey'

describe('maskKey', () => {
  it('returns empty for an empty / whitespace key', () => {
    expect(maskKey('')).toBe('')
    expect(maskKey('   ')).toBe('')
  })

  it('masks the middle, keeping a short prefix hint + last 4', () => {
    expect(maskKey('sk-ant-api03-abcd1234')).toBe('sk-…1234')
  })

  it('fully dots a very short key (nothing safe to reveal)', () => {
    expect(maskKey('abcd')).toBe('••••')
    expect(maskKey('ab')).toBe('••')
  })

  it('trims surrounding whitespace before masking', () => {
    expect(maskKey('  sk-ant-zzzz9999  ')).toBe('sk-…9999')
  })
})

describe('validateKeyShape', () => {
  it('rejects an empty key as required', () => {
    expect(validateKeyShape('anthropic', '')).toEqual({ ok: false, messageKey: 'settings.keyRequired' })
    expect(validateKeyShape('anthropic', '   ')).toEqual({ ok: false, messageKey: 'settings.keyRequired' })
  })

  it('rejects a wrong-prefix Anthropic key', () => {
    expect(validateKeyShape('anthropic', 'pk-wrong-000000000000')).toEqual({
      ok: false,
      messageKey: 'settings.keyBadPrefix',
    })
  })

  it('rejects a correctly-prefixed but too-short key', () => {
    expect(validateKeyShape('anthropic', 'sk-ant-')).toEqual({ ok: false, messageKey: 'settings.keyTooShort' })
  })

  it('accepts a well-formed Anthropic key', () => {
    expect(validateKeyShape('anthropic', 'sk-ant-api03-abcd1234efgh')).toEqual({ ok: true })
  })

  it('accepts any non-trivial key for a vendor without a known prefix', () => {
    expect(validateKeyShape('ollama', 'anything-long-enough')).toEqual({ ok: true })
  })
})

// WI-3 — pure validation for the custom-provider add/edit form (#10, design Section B)
import { describe, it, expect } from 'vitest'
import { isValidBaseUrl, customFormValid } from './customProviderForm'

describe('isValidBaseUrl', () => {
  it.each([
    { url: 'https://api.together.xyz/v1', valid: true },
    { url: 'http://192.168.1.10:11434/v1', valid: true }, // LAN http endpoint
    { url: 'https://host', valid: true },
    { url: '  https://host/v1  ', valid: true }, // trimmed
    { url: 'api.together.xyz', valid: false }, // scheme-less (design Section B)
    { url: 'api.together.xyz/v1', valid: false },
    { url: '', valid: false },
    { url: '   ', valid: false },
    { url: 'ftp://host/v1', valid: false }, // only http(s)
    { url: 'ws://host', valid: false },
    { url: 'not a url', valid: false },
    { url: 'https://', valid: false }, // no host
    { url: 'javascript:alert(1)', valid: false }, // hostile scheme rejected
  ])('isValidBaseUrl($url) → $valid', ({ url, valid }) => {
    expect(isValidBaseUrl(url)).toBe(valid)
  })
})

describe('customFormValid', () => {
  // uniqueLabelPredicate stands in for the store's uniqueLabel(label, exceptId?).
  const uniq = (taken: string[]) => (label: string) =>
    label.trim() !== '' && !taken.some((l) => l.trim().toLowerCase() === label.trim().toLowerCase())

  it('valid when label is unique-nonempty AND url parses AND model nonempty', () => {
    expect(customFormValid({ label: 'Together', baseUrl: 'https://h/v1', model: 'm' }, uniq([]))).toBe(true)
  })
  it('invalid when label is a duplicate', () => {
    expect(
      customFormValid({ label: 'Together', baseUrl: 'https://h/v1', model: 'm' }, uniq(['together'])),
    ).toBe(false)
  })
  it('invalid when label is empty/whitespace', () => {
    expect(customFormValid({ label: '   ', baseUrl: 'https://h/v1', model: 'm' }, uniq([]))).toBe(false)
  })
  it('invalid when the url is scheme-less', () => {
    expect(customFormValid({ label: 'Together', baseUrl: 'h/v1', model: 'm' }, uniq([]))).toBe(false)
  })
  it('invalid when the model is empty/whitespace', () => {
    expect(customFormValid({ label: 'Together', baseUrl: 'https://h/v1', model: '  ' }, uniq([]))).toBe(false)
  })
})

// WI-3 — the rail's compressed per-custom status line (design Section A populated rows).
import { customRailStatusKey } from './customProviderForm'

describe('customRailStatusKey', () => {
  it.each([
    { tr: { status: 'ok' as const }, key: '', expected: 'settings.connOk' },
    { tr: { status: 'testing' as const }, key: 'sk', expected: 'settings.testing' },
    { tr: { status: 'fail' as const }, key: 'sk', expected: 'settings.needsKey' },
    // idle with no key → needs key (a previously-keyed custom after reload — key was stripped, §5).
    { tr: { status: 'idle' as const }, key: '', expected: 'settings.needsKey' },
    // idle WITH a key → untested (waiting for a connection test).
    { tr: { status: 'idle' as const }, key: 'sk-x', expected: 'settings.statusUntested' },
  ])('status=$tr.status key=$key → $expected', ({ tr, key, expected }) => {
    expect(customRailStatusKey(tr, key)).toBe(expected)
  })
})

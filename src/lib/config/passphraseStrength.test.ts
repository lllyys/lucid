// WI-6 — passphrase-strength helper: a PURE function feeding the Set-passphrase card's 4-segment
// meter (design Section B). Maps a passphrase to a 0–4 level + a label key. No secrets logged/kept
// (it returns only a score, never the input); table-driven per rule 10.
import { describe, it, expect } from 'vitest'
import { passphraseStrength } from './passphraseStrength'

describe('passphraseStrength', () => {
  it('empty passphrase → level 0, label "none"', () => {
    const r = passphraseStrength('')
    expect(r.level).toBe(0)
    expect(r.labelKey).toBe('configSync.strength.none')
  })

  it.each([
    // short, single class → weak (level 1)
    { pass: 'abc', level: 1, labelKey: 'configSync.strength.weak' },
    { pass: 'abcdef', level: 1, labelKey: 'configSync.strength.weak' },
    // medium length, two classes → fair (level 2)
    { pass: 'abcd1234', level: 2, labelKey: 'configSync.strength.fair' },
    { pass: 'Abcdefgh', level: 2, labelKey: 'configSync.strength.fair' },
    // longer, three classes → good (level 3)
    { pass: 'Abcd1234efgh', level: 3, labelKey: 'configSync.strength.good' },
    // long + all four classes → strong (level 4)
    { pass: 'Abcd1234!@#$efgh', level: 4, labelKey: 'configSync.strength.strong' },
    // the design's example passphrase → strong band
    { pass: 'correct-horse-battery', level: 3, labelKey: 'configSync.strength.good' },
  ])('"$pass" → level $level ($labelKey)', ({ pass, level, labelKey }) => {
    const r = passphraseStrength(pass)
    expect(r.level).toBe(level)
    expect(r.labelKey).toBe(labelKey)
  })

  it('level is always within 0..4', () => {
    for (const p of ['', 'a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Aa1!Aa1!Aa1!Aa1!Aa1!']) {
      const { level } = passphraseStrength(p)
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThanOrEqual(4)
    }
  })

  it('counts CJK / non-ASCII as a character class (no whitespace-word assumptions, rule 66 §3)', () => {
    // A long CJK passphrase has length variety but maps via the "other" class; must not be level 0.
    const r = passphraseStrength('翻译润色密码短语很长')
    expect(r.level).toBeGreaterThanOrEqual(1)
  })

  it('rewards length even with one class (long lowercase runs reach at least fair)', () => {
    const r = passphraseStrength('abcdefghijklmnopqrst')
    expect(r.level).toBeGreaterThanOrEqual(2)
  })

  it('treats a whitespace-only string as empty (level 0)', () => {
    expect(passphraseStrength('     ').level).toBe(0)
  })

  it('ignores internal spaces as a character class (a space is neither symbol nor "other")', () => {
    // "my secret pass" has lowercase + interior spaces; the spaces must not count as a class, so this
    // stays a single-class run (level 1). If a space were miscounted as a class it would jump to 2.
    expect(passphraseStrength('my secret pass').level).toBe(1)
  })
})

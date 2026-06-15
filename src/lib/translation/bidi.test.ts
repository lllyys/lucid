import { describe, it, expect } from 'vitest'
import { resolveBidiDirection } from './bidi'

describe('resolveBidiDirection', () => {
  describe('override (visual-only, route-independent)', () => {
    it('forces ltr / rtl regardless of content', () => {
      expect(resolveBidiDirection('شلام', 'ltr')).toBe('ltr')
      expect(resolveBidiDirection('hello', 'rtl')).toBe('rtl')
    })
    it('auto falls through to content detection', () => {
      expect(resolveBidiDirection('hello', 'auto')).toBe('ltr')
      expect(resolveBidiDirection('שלום', 'auto')).toBe('rtl')
    })
  })

  describe('first-strong detection (UAX#9 strong letter)', () => {
    it('Latin / CJK first-strong ⇒ ltr', () => {
      expect(resolveBidiDirection('Hello world', 'auto')).toBe('ltr')
      expect(resolveBidiDirection('你好世界', 'auto')).toBe('ltr')
    })
    it('Arabic / Hebrew first-strong ⇒ rtl', () => {
      expect(resolveBidiDirection('مرحبا بالعالم', 'auto')).toBe('rtl')
      expect(resolveBidiDirection('שלום עולם', 'auto')).toBe('rtl')
    })
    it('leading neutrals/punctuation then RTL ⇒ rtl', () => {
      expect(resolveBidiDirection('   «שלום»', 'auto')).toBe('rtl')
    })
    it('leading LTR then RTL ⇒ ltr (first strong wins, not majority)', () => {
      expect(resolveBidiDirection('Hi שלום עולם ושלום', 'auto')).toBe('ltr')
    })
    it('Arabic-Indic digits only ⇒ ltr (weak AN, not strong)', () => {
      expect(resolveBidiDirection('١٢٣٤٥', 'auto')).toBe('ltr')
      expect(resolveBidiDirection('٠٩٨', 'auto')).toBe('ltr')
    })
    it('a combining mark before the first letter does not flip detection', () => {
      // U+0301 combining acute (a mark, not strong) then a Hebrew letter
      expect(resolveBidiDirection('́ש', 'auto')).toBe('rtl')
    })
    it('ASCII digits / punctuation / whitespace only ⇒ ltr', () => {
      expect(resolveBidiDirection('12345', 'auto')).toBe('ltr')
      expect(resolveBidiDirection('  .,!? ', 'auto')).toBe('ltr')
      expect(resolveBidiDirection('', 'auto')).toBe('ltr')
    })
    it('numbers/punct before an RTL letter still resolve rtl', () => {
      expect(resolveBidiDirection('123 — مرحبا', 'auto')).toBe('rtl')
    })
    it('emoji before a letter is skipped (not strong)', () => {
      expect(resolveBidiDirection('👍 שלום', 'auto')).toBe('rtl')
      expect(resolveBidiDirection('👍 hello', 'auto')).toBe('ltr')
    })
  })
})

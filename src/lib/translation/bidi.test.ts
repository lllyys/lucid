import { describe, it, expect } from 'vitest'
import { resolveBidiDirection, bidiAttrs } from './bidi'

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
    it('historical / obscure RTL scripts resolve rtl (Phoenician, Old South Arabian, Kharoshthi, Avestan)', () => {
      expect(resolveBidiDirection('𐤀𐤁𐤂 hello', 'auto')).toBe('rtl') // Phoenician U+10900
      expect(resolveBidiDirection('𐩠𐩡 world', 'auto')).toBe('rtl') // Old South Arabian U+10A60
      expect(resolveBidiDirection('𐨐𐨑 x', 'auto')).toBe('rtl') // Kharoshthi U+10A10
      expect(resolveBidiDirection('𐬀𐬁 y', 'auto')).toBe('rtl') // Avestan U+10B00
    })
    it('a leading strong-R non-letter (Hebrew maqaf / RLM / ALM) resolves rtl before Latin', () => {
      expect(resolveBidiDirection('־ Hello', 'auto')).toBe('rtl') // maqaf U+05BE then Latin
      expect(resolveBidiDirection('‏Hello', 'auto')).toBe('rtl') // RLM U+200F then Latin
      expect(resolveBidiDirection('؜Hello', 'auto')).toBe('rtl') // ALM U+061C (bidi AL) then Latin
    })
    it('a leading LRM (strong L) resolves ltr even before RTL letters', () => {
      expect(resolveBidiDirection('‎مرحبا', 'auto')).toBe('ltr') // LRM U+200E then Arabic
    })
  })

  describe('bidiAttrs (v4 §4 — isolate for forced, plaintext for auto)', () => {
    it('auto ⇒ dir="auto" + unicode-bidi plaintext (browser detects)', () => {
      expect(bidiAttrs('auto')).toEqual({ dir: 'auto', style: { unicodeBidi: 'plaintext' } })
    })
    it('forced ltr/rtl ⇒ explicit dir + unicode-bidi isolate (honors the forced direction)', () => {
      expect(bidiAttrs('ltr')).toEqual({ dir: 'ltr', style: { unicodeBidi: 'isolate' } })
      expect(bidiAttrs('rtl')).toEqual({ dir: 'rtl', style: { unicodeBidi: 'isolate' } })
    })
  })
})

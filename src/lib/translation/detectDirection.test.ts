import { describe, it, expect } from 'vitest'
import { detectDirection, directionLabels } from './detectDirection'
import { resolveLanguage } from '@/lib/prompts'

describe('detectDirection', () => {
  it.each([
    ['Chinese', '你好世界，这是测试。', 'zh-en'],
    ['English', 'Hello world', 'en-zh'],
    ['empty', '', 'en-zh'],
    ['English embedded in Chinese (mixed)', '请 enable 双向同步', 'zh-en'],
    ['Han extension B (surrogate pair)', '\u{20000}', 'zh-en'],
    ['emoji only', '👍🏽🎉', 'en-zh'],
    ['digits / punctuation only', '123 — !?', 'en-zh'],
  ])('%s ⇒ %s', (_label, text, expected) => {
    expect(detectDirection(text)).toBe(expected)
  })

  it('treats Japanese kana and Korean hangul as non-Chinese (documented Han-only limitation)', () => {
    expect(detectDirection('こんにちは')).toBe('en-zh') // hiragana
    expect(detectDirection('カタカナ')).toBe('en-zh') // katakana
    expect(detectDirection('안녕하세요')).toBe('en-zh') // hangul
  })
})

describe('directionLabels', () => {
  it('maps each direction to distinct codes with native labels', () => {
    expect(directionLabels('zh-en')).toEqual({ srcCode: 'zh', tgtCode: 'en', srcNative: '中文', tgtNative: 'English' })
    expect(directionLabels('en-zh')).toEqual({ srcCode: 'en', tgtCode: 'zh', srcNative: 'English', tgtNative: '中文' })
  })

  it('always yields src !== tgt and codes resolveLanguage accepts (no no-op same-language request)', () => {
    for (const dir of ['zh-en', 'en-zh'] as const) {
      const { srcCode, tgtCode } = directionLabels(dir)
      expect(srcCode).not.toBe(tgtCode)
      expect(resolveLanguage(srcCode)).toBeDefined()
      expect(resolveLanguage(tgtCode)).toBeDefined()
    }
  })
})

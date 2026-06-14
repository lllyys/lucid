// Purpose: automatic two-way 中↔EN direction detection for the Translate panel
// (feature #2). Pure-auto: any Han codepoint ⇒ translate Chinese→English, else
// English→Chinese. There is no manual override in the committed design (Swap feeds the
// result back as the new source); an explicit override is needs-design #17.

/**
 * Match any Han (Chinese) codepoint, including CJK extensions and surrogate-pair
 * ideographs (the `u` flag makes \p{Script=Han} cover U+20000+). Deliberately Han-only:
 * Japanese kana and Korean hangul are NOT Han, so they fall to en-zh (documented limit —
 * the panel is scoped strictly 中↔EN).
 */
const HAN = /\p{Script=Han}/u

export type TranslateDirection = 'zh-en' | 'en-zh'

export function detectDirection(text: string): TranslateDirection {
  return HAN.test(text) ? 'zh-en' : 'en-zh'
}

export interface DirectionLabels {
  /** Source language code accepted by resolveLanguage (lib/prompts). */
  srcCode: 'zh' | 'en'
  /** Target language code; always distinct from srcCode (no same-language request). */
  tgtCode: 'zh' | 'en'
  /** Endonym shown in the direction pill. */
  srcNative: string
  tgtNative: string
}

export function directionLabels(dir: TranslateDirection): DirectionLabels {
  return dir === 'zh-en'
    ? { srcCode: 'zh', tgtCode: 'en', srcNative: '中文', tgtNative: 'English' }
    : { srcCode: 'en', tgtCode: 'zh', srcNative: 'English', tgtNative: '中文' }
}

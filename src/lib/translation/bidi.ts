// Purpose: resolve the VISUAL base direction of a piece of text (feature #4, WI-3 — #17a).
// This is layout only and is deliberately SEPARATE from detectDirection (which returns the
// translation ROUTE zh-en|en-zh). A forced override is visual-only and never changes the
// request's source language (plan v4 §3).
//
// Detection is UAX#9 "first strong": the base direction is decided by the first STRONG
// directional character. We approximate "strong" as the first LETTER (\p{L}) — this correctly
// SKIPS weak characters (Arabic-Indic digits like ١ are \p{Nd}, European digits, combining
// marks \p{M}, punctuation, whitespace, emoji), so digit- or punctuation-led RTL text still
// resolves rtl, and an Arabic-Indic-digits-only string resolves ltr.

export type BidiDirection = 'ltr' | 'rtl'
export type BidiOverride = 'auto' | BidiDirection

// Strong-RTL scripts (Unicode bidi class R or AL). Intersected with \p{L} at call sites so weak
// same-script characters (e.g. Arabic-Indic digits U+0660–0669 / U+06F0–06F9, which are \p{Nd},
// bidi class AN) are excluded. Covers every R/AL script — modern (Arabic, Hebrew, Syriac, Thaana,
// NKo, Samaritan, Mandaic, Adlam, Hanifi Rohingya, Mende Kikakui, Yezidi) and historical
// (Imperial/Old Aramaic, Phoenician, Nabataean, Palmyrene, Hatran, Old South/North Arabian, Old
// Turkic, Old Hungarian, Sogdian, Old Sogdian, Chorasmian, Elymaic, Manichaean, the Pahlavi/
// Parthian scripts) — so a string led by any of them resolves rtl before later Latin text.
const RTL_SCRIPT =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}\p{Script=Yezidi}\p{Script=Imperial_Aramaic}\p{Script=Phoenician}\p{Script=Nabataean}\p{Script=Palmyrene}\p{Script=Hatran}\p{Script=Old_South_Arabian}\p{Script=Old_North_Arabian}\p{Script=Old_Turkic}\p{Script=Old_Hungarian}\p{Script=Sogdian}\p{Script=Old_Sogdian}\p{Script=Chorasmian}\p{Script=Elymaic}\p{Script=Manichaean}\p{Script=Psalter_Pahlavi}\p{Script=Inscriptional_Pahlavi}\p{Script=Inscriptional_Parthian}]/u
// Strong-R characters that are NOT letters (so \p{L} misses them): Hebrew punctuation — maqaf
// U+05BE, paseq U+05C0, sof pasuq U+05C3, nun hafukha U+05C6 — and the RIGHT-TO-LEFT MARK U+200F.
const RTL_STRONG_NONLETTER = /[־׀׃׆‏]/u
const LETTER = /\p{L}/u

/**
 * Resolve the base direction for layout. `override` of `'ltr'`/`'rtl'` forces that direction
 * (visual-only); `'auto'` detects from content by the first STRONG character (UAX#9): a letter of
 * an RTL script, or a strong-R non-letter, ⇒ rtl; the first strong-LTR letter ⇒ ltr. Weak/neutral
 * characters (digits incl. Arabic-Indic, marks, punctuation, whitespace, emoji) are skipped. No
 * strong character (empty / neutral-only) ⇒ `'ltr'`.
 */
export function resolveBidiDirection(text: string, override: BidiOverride): BidiDirection {
  if (override === 'ltr' || override === 'rtl') return override
  for (const ch of text) {
    if (RTL_STRONG_NONLETTER.test(ch)) return 'rtl' // strong-R punctuation / RLM
    if (!LETTER.test(ch)) continue // skip weak/neutral
    return RTL_SCRIPT.test(ch) ? 'rtl' : 'ltr' // first strong letter decides
  }
  return 'ltr'
}

export interface BidiAttrs {
  dir: 'auto' | BidiDirection
  style: { unicodeBidi: 'plaintext' | 'isolate' }
}

/**
 * The `dir` + `unicode-bidi` to put on an editable/result surface (plan v4 §4). In `auto` mode
 * the browser detects each paragraph's base direction (`dir="auto"` + `unicode-bidi: plaintext`).
 * A FORCED direction must use `unicode-bidi: isolate` with an explicit `dir` — `plaintext` would
 * make the browser re-detect from content and IGNORE the forced direction. Pair with logical
 * (start/end) text alignment so the override changes layout, never the request language.
 */
export function bidiAttrs(override: BidiOverride): BidiAttrs {
  if (override === 'auto') return { dir: 'auto', style: { unicodeBidi: 'plaintext' } }
  return { dir: override, style: { unicodeBidi: 'isolate' } }
}

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

// Strong-RTL scripts (bidi classes R / AL). Intersected with \p{L} at call sites so weak
// same-script characters (e.g. Arabic-Indic digits U+0660–0669, which are \p{Nd}) are excluded.
const RTL_SCRIPT =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u
const LETTER = /\p{L}/u

/**
 * Resolve the base direction for layout. `override` of `'ltr'`/`'rtl'` forces that direction
 * (visual-only); `'auto'` detects from content by first strong letter. No strong letter (empty,
 * digits, punctuation, neutrals only) ⇒ `'ltr'`.
 */
export function resolveBidiDirection(text: string, override: BidiOverride): BidiDirection {
  if (override === 'ltr' || override === 'rtl') return override
  for (const ch of text) {
    if (!LETTER.test(ch)) continue // skip weak/neutral: digits, marks, punctuation, whitespace, emoji
    return RTL_SCRIPT.test(ch) ? 'rtl' : 'ltr' // first strong letter decides
  }
  return 'ltr'
}

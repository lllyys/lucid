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

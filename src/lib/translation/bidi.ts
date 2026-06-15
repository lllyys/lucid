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

// Strong right-to-left codepoint ranges — Unicode bidi class R or AL, taken verbatim from the UCD
// `DerivedBidiClass.txt` (latest), merged into sorted, disjoint [start, end] pairs. This is the
// AUTHORITATIVE set: it covers EVERY strong-RTL codepoint — all RTL scripts (Hebrew, Arabic,
// Syriac, Thaana, NKo, Samaritan, Mandaic, Adlam, Hanifi Rohingya, Mende Kikakui, Yezidi,
// Phoenician, Imperial Aramaic, Nabataean, Palmyrene, Hatran, Old South/North Arabian, Old Turkic,
// Old Hungarian, Sogdian, Old Sogdian, Chorasmian, Elymaic, Manichaean, the Pahlavi/Parthian
// scripts, Kharoshthi, Avestan, Lydian, Old Uyghur, Garay, …) AND the strong-R/AL marks and
// punctuation (RLM U+200F, ALM U+061C, Hebrew maqaf U+05BE, …). Weak AN characters (Arabic-Indic
// digits) are bidi class AN, NOT R/AL, so they are intentionally absent.
const RTL_RANGES: readonly (readonly [number, number])[] = [
  [0x5be, 0x5be], [0x5c0, 0x5c0], [0x5c3, 0x5c3], [0x5c6, 0x5c6], [0x5d0, 0x5ea], [0x5ef, 0x5f4],
  [0x608, 0x608], [0x60b, 0x60b], [0x60d, 0x60d], [0x61b, 0x64a], [0x66d, 0x66f], [0x671, 0x6d5],
  [0x6e5, 0x6e6], [0x6ee, 0x6ef], [0x6fa, 0x70d], [0x70f, 0x710], [0x712, 0x72f], [0x74d, 0x7a5],
  [0x7b1, 0x7b1], [0x7c0, 0x7ea], [0x7f4, 0x7f5], [0x7fa, 0x7fa], [0x7fe, 0x815], [0x81a, 0x81a],
  [0x824, 0x824], [0x828, 0x828], [0x830, 0x83e], [0x840, 0x858], [0x85e, 0x85e], [0x860, 0x86a],
  [0x870, 0x88f], [0x8a0, 0x8c9], [0x200f, 0x200f], [0xfb1d, 0xfb1d], [0xfb1f, 0xfb28],
  [0xfb2a, 0xfb36], [0xfb38, 0xfb3c], [0xfb3e, 0xfb3e], [0xfb40, 0xfb41], [0xfb43, 0xfb44],
  [0xfb46, 0xfbc2], [0xfbd3, 0xfd3d], [0xfd50, 0xfd8f], [0xfd92, 0xfdc7], [0xfdf0, 0xfdfc],
  [0xfe70, 0xfe74], [0xfe76, 0xfefc], [0x10800, 0x10805], [0x10808, 0x10808], [0x1080a, 0x10835],
  [0x10837, 0x10838], [0x1083c, 0x1083c], [0x1083f, 0x10855], [0x10857, 0x1089e], [0x108a7, 0x108af],
  [0x108e0, 0x108f2], [0x108f4, 0x108f5], [0x108fb, 0x1091b], [0x10920, 0x10939], [0x1093f, 0x10959],
  [0x10980, 0x109b7], [0x109bc, 0x109cf], [0x109d2, 0x10a00], [0x10a10, 0x10a13], [0x10a15, 0x10a17],
  [0x10a19, 0x10a35], [0x10a40, 0x10a48], [0x10a50, 0x10a58], [0x10a60, 0x10a9f], [0x10ac0, 0x10ae4],
  [0x10aeb, 0x10af6], [0x10b00, 0x10b35], [0x10b40, 0x10b55], [0x10b58, 0x10b72], [0x10b78, 0x10b91],
  [0x10b99, 0x10b9c], [0x10ba9, 0x10baf], [0x10c00, 0x10c48], [0x10c80, 0x10cb2], [0x10cc0, 0x10cf2],
  [0x10cfa, 0x10d23], [0x10d4a, 0x10d65], [0x10d6f, 0x10d85], [0x10d8e, 0x10d8f], [0x10e80, 0x10ea9],
  [0x10ead, 0x10ead], [0x10eb0, 0x10eb1], [0x10ec2, 0x10ec7], [0x10f00, 0x10f27], [0x10f30, 0x10f45],
  [0x10f51, 0x10f59], [0x10f70, 0x10f81], [0x10f86, 0x10f89], [0x10fb0, 0x10fcb], [0x10fe0, 0x10ff6],
  [0x1e800, 0x1e8c4], [0x1e8c7, 0x1e8cf], [0x1e900, 0x1e943], [0x1e94b, 0x1e94b], [0x1e950, 0x1e959],
  [0x1e95e, 0x1e95f], [0x1ec71, 0x1ecb4], [0x1ed01, 0x1ed3d], [0x1ee00, 0x1ee03], [0x1ee05, 0x1ee1f],
  [0x1ee21, 0x1ee22], [0x1ee24, 0x1ee24], [0x1ee27, 0x1ee27], [0x1ee29, 0x1ee32], [0x1ee34, 0x1ee37],
  [0x1ee39, 0x1ee39], [0x1ee3b, 0x1ee3b], [0x1ee42, 0x1ee42], [0x1ee47, 0x1ee47], [0x1ee49, 0x1ee49],
  [0x1ee4b, 0x1ee4b], [0x1ee4d, 0x1ee4f], [0x1ee51, 0x1ee52], [0x1ee54, 0x1ee54], [0x1ee57, 0x1ee57],
  [0x1ee59, 0x1ee59], [0x1ee5b, 0x1ee5b], [0x1ee5d, 0x1ee5d], [0x1ee5f, 0x1ee5f], [0x1ee61, 0x1ee62],
  [0x1ee64, 0x1ee64], [0x1ee67, 0x1ee6a], [0x1ee6c, 0x1ee72], [0x1ee74, 0x1ee77], [0x1ee79, 0x1ee7c],
  [0x1ee7e, 0x1ee7e], [0x1ee80, 0x1ee89], [0x1ee8b, 0x1ee9b], [0x1eea1, 0x1eea3], [0x1eea5, 0x1eea9],
  [0x1eeab, 0x1eebb],
]

/** Binary-search the sorted, disjoint RTL ranges. */
function isStrongRtl(cp: number): boolean {
  let lo = 0
  let hi = RTL_RANGES.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [start, end] = RTL_RANGES[mid]
    if (cp < start) hi = mid - 1
    else if (cp > end) lo = mid + 1
    else return true
  }
  return false
}

const LETTER = /\p{L}/u
const LRM = 0x200e // LEFT-TO-RIGHT MARK — bidi class L (strong LTR), not a letter

/**
 * Resolve the base direction for layout. `override` of `'ltr'`/`'rtl'` forces that direction
 * (visual-only); `'auto'` detects from content by the first STRONG character per UAX#9: a strong
 * R/AL codepoint ⇒ rtl; the first strong-L (any non-RTL letter, or LRM) ⇒ ltr. Weak/neutral
 * characters (digits incl. Arabic-Indic, combining marks, punctuation, whitespace, emoji) are
 * skipped. No strong character (empty / neutral-only) ⇒ `'ltr'`.
 */
export function resolveBidiDirection(text: string, override: BidiOverride): BidiDirection {
  if (override === 'ltr' || override === 'rtl') return override
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (isStrongRtl(cp)) return 'rtl' // strong R/AL: RTL letters, marks, RLM, ALM, maqaf, …
    if (cp === LRM || LETTER.test(ch)) return 'ltr' // strong L: LRM, or any non-RTL letter
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

// Purpose: a PURE passphrase-strength estimator feeding the Set-passphrase card's 4-segment meter
// (#15 WI-6, design Section B). Given a passphrase it returns a 0–4 level + a localized label key.
// SECURITY: it never logs, stores, or returns the passphrase — only an opaque score derived from
// length + character-class variety. No external dependency (rule 60 §4); simple length/class scoring,
// the common zxcvbn-free heuristic. CJK / non-ASCII counts as a class so a no-whitespace CJK
// passphrase still scores (rule 66 §3 — never assume inter-word spaces).
//
// Scoring (kept deliberately simple + table-tested): start from length bands, add for class variety,
// then clamp to 0..4. An empty / whitespace-only passphrase is always level 0.

/** A strength level 0..4 and the i18n label key for the meter's caption. */
export interface PassphraseStrength {
  /** 0 = none, 1 = weak, 2 = fair, 3 = good, 4 = strong. Drives the 4-segment meter fill. */
  level: 0 | 1 | 2 | 3 | 4
  /** Flat dot-key for t() — `configSync.strength.{none|weak|fair|good|strong}`. */
  labelKey: string
}

const LABEL_KEYS = [
  'configSync.strength.none',
  'configSync.strength.weak',
  'configSync.strength.fair',
  'configSync.strength.good',
  'configSync.strength.strong',
] as const

/** Count the distinct character classes present: lower, upper, digit, symbol, other (incl. CJK). */
function classCount(pass: string): number {
  let lower = false
  let upper = false
  let digit = false
  let symbol = false
  let other = false
  for (const ch of pass) {
    if (ch >= 'a' && ch <= 'z') lower = true
    else if (ch >= 'A' && ch <= 'Z') upper = true
    else if (ch >= '0' && ch <= '9') digit = true
    else if (/[!-/:-@[-`{-~]/.test(ch)) symbol = true
    else if (ch.trim() !== '') other = true // non-ASCII (CJK, accents, emoji) — a real class
  }
  return [lower, upper, digit, symbol, other].filter(Boolean).length
}

/** Estimate passphrase strength as a 0..4 level + a label key. Pure — never touches the secret again. */
export function passphraseStrength(passphrase: string): PassphraseStrength {
  const trimmed = passphrase.trim()
  if (trimmed.length === 0) return { level: 0, labelKey: LABEL_KEYS[0] }

  const len = passphrase.length
  const classes = classCount(passphrase)

  // Length band: longer passphrases earn more regardless of class mix (length dominates entropy),
  // but length alone is capped at +2 so a single-class run can't reach "strong" on length only.
  let score = 0
  if (len >= 20) score += 2
  else if (len >= 8) score += 1

  // Class variety: each class beyond the first adds a point (caps the contribution at +3), so the
  // top band ("strong", 4) needs both real length AND a mix of character classes.
  score += Math.min(classes - 1, 3)

  // Map the raw score onto 1..4 (anything non-empty is at least weak). Clamp the top at 4.
  const level = Math.min(Math.max(score, 1), 4) as 1 | 2 | 3 | 4
  return { level, labelKey: LABEL_KEYS[level] }
}

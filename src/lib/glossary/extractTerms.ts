// Purpose: propose candidate glossary terms from the active editor text (feature #3, WI-2 — the
// design's "Extract from current text"). A LOCAL heuristic — never an LLM/provider call. v1 is
// Latin-script-oriented (capitalization + repetition); case-less scripts (CJK) yield nothing, a
// documented limitation (a future version can add segmenter-based CJK term mining). Pure function.

const MAX_TERMS = 8

/**
 * Extract up to 8 candidate domain terms from `text`, excluding any already in `existing`
 * (case-insensitive). Heuristics: multi-word Capitalized phrases ("Quantum Computing"), all-caps
 * acronyms ("GPU"), and repeated lowercase technical tokens (≥4 chars, appearing ≥2×). De-duped
 * case-insensitively, first-seen casing wins.
 */
export function extractTerms(text: string, existing: readonly string[] = []): string[] {
  const seen = new Set(existing.map((e) => e.trim().toLowerCase()))
  // Individual words of existing (possibly multi-word) terms — so a known "Quantum Computing" term
  // doesn't make us re-suggest "Quantum" / "Computing" as separate repeated tokens.
  const existingWords = new Set<string>()
  for (const e of existing) for (const w of e.toLowerCase().split(/\s+/)) existingWords.add(w)
  const out: string[] = []
  const push = (raw: string) => {
    const term = raw.trim()
    const key = term.toLowerCase()
    if (key.length < 2 || seen.has(key)) return
    seen.add(key)
    out.push(term)
  }

  // 1. Multi-word capitalized phrases (2+ consecutive Capitalized words).
  for (const m of text.matchAll(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g)) push(m[0])
  // 2. All-caps acronyms (≥2 letters).
  for (const m of text.matchAll(/\b[A-Z]{2,}\b/g)) push(m[0])
  // 3. Repeated lowercase-ish Latin tokens (≥4 chars, appearing ≥2×).
  const freq = new Map<string, number>()
  const firstForm = new Map<string, string>()
  for (const m of text.matchAll(/[A-Za-z]{4,}/g)) {
    const key = m[0].toLowerCase()
    freq.set(key, (freq.get(key) ?? 0) + 1)
    if (!firstForm.has(key)) firstForm.set(key, m[0])
  }
  for (const [key, n] of freq) if (n >= 2 && !existingWords.has(key)) push(firstForm.get(key)!)

  return out.slice(0, MAX_TERMS)
}

// Purpose: Unicode-correct word + sentence segmentation for the word-lookup popover
// (feature #20). Built on Intl.Segmenter so CJK (no inter-word spaces), RTL, emoji
// grapheme clusters, and mixed-script text segment correctly without whitespace
// heuristics (rule 66 §3). tokenize() drives ClickableText's render; sentenceAt() finds
// the sentence a clicked word belongs to (the define request's context).

/** One segment of the source text with its cumulative start offset. */
export interface TextSegment {
  /** The raw substring (word, punctuation, or whitespace). */
  value: string
  /** UTF-16 start index of this segment within the source text. */
  offset: number
  /** True for word-like segments (clickable); false for punctuation/whitespace. */
  isWord: boolean
}

const DEFAULT_LOCALE = 'en'

/**
 * Split `text` into ordered word/non-word segments. Word-like tokens (isWord=true) are the
 * clickable units; the cumulative `offset` lets a click resolve back to its sentence. The
 * concatenation of all segment values reconstructs the source exactly (no character is lost).
 */
export function tokenize(text: string, locale: string = DEFAULT_LOCALE): TextSegment[] {
  if (text === '') return []
  const seg = new Intl.Segmenter(locale, { granularity: 'word' })
  const out: TextSegment[] = []
  for (const s of seg.segment(text)) {
    out.push({ value: s.segment, offset: s.index, isWord: s.isWordLike === true })
  }
  return out
}

/**
 * Return the sentence that contains `offset`. Uses Intl.Segmenter sentence granularity so
 * CJK (。), Latin (.), and other terminators are honored. An out-of-range offset is clamped
 * into [0, length] so a stale click never throws; empty text yields an empty string.
 */
export function sentenceAt(text: string, offset: number, locale: string = DEFAULT_LOCALE): string {
  if (text === '') return ''
  const clamped = offset < 0 ? 0 : offset > text.length ? text.length : offset
  const seg = new Intl.Segmenter(locale, { granularity: 'sentence' })
  let last = ''
  for (const s of seg.segment(text)) {
    last = s.segment
    if (clamped >= s.index && clamped < s.index + s.segment.length) return s.segment
  }
  // offset === text.length (or past it, clamped): fall through to the final sentence.
  return last
}

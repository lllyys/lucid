// Purpose: derive the clickable WORD segments (each with its [start,end) offsets) that the
// editable-lookup mirror overlay (feature #169, WI-2) renders over a textarea. Reuses #20's
// Intl.Segmenter tokenizer (segment.ts) so CJK (no inter-word spaces), RTL, and mixed-script
// text segment correctly — inter-word gaps (punctuation, whitespace) are dropped because only
// word glyphs are clickable, and the offsets let a click resolve its sentence via sentenceAt().
// Does NOT reimplement segmentation.

import { tokenize } from './segment'

/** A clickable word in the overlay: its text plus its UTF-16 [start, end) range in the source. */
export interface WordSegment {
  text: string
  start: number
  end: number
}

/**
 * Return only the word-like segments of `text`, each with its UTF-16 start/end offsets. Inter-word
 * gaps (punctuation, whitespace) are excluded — they are never clickable. Empty text yields [].
 * `locale` is forwarded to the segmenter (omit it to use tokenize's default locale).
 */
export function wordSegments(text: string, locale?: string): WordSegment[] {
  return tokenize(text, locale)
    .filter((s) => s.isWord)
    .map((s) => ({ text: s.value, start: s.offset, end: s.offset + s.value.length }))
}

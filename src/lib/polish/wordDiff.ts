// Purpose: the real word-level diff for the Polish Compare view (feature #2, WI-5),
// replacing the mock's canned DIFF. It tokenizes both texts — protecting opaque atomic
// spans (fenced + indented code, inline code, URLs, placeholders) and word-segmenting the
// prose via an injectable Intl.Segmenter (rule 66 §1/§3) — then diffs the TOKEN ARRAYS
// with jsdiff `diffArrays` (NOT diffWords' intlSegmenter; see Phase-0). A measured size
// preflight + maxEditLength bound fall back to a coarse whole-replace so a huge input can
// never block the main thread. `applyDiff` merges accepted segments back to text (rule 66 §2).

import { diffArrays } from 'diff'

export type DiffSegment = { id: string; type: 'same' | 'add' | 'del'; value: string }

export interface WordDiff {
  diff(original: string, result: string): DiffSegment[]
}

export interface WordDiffOptions {
  /** Injectable for deterministic CJK tests (rule 66 §4). Defaults to a word segmenter. */
  segmenter?: Intl.Segmenter
  /** Above this many chars on either side, skip the fine diff (Phase-0: 30k ≈ a few hundred ms). */
  maxChars?: number
  /** jsdiff edit-distance bound; exceeding it falls back to a coarse whole-replace. */
  maxEditLength?: number
}

const DEFAULT_MAX_CHARS = 30_000
const DEFAULT_MAX_EDIT = 5_000

// Opaque atomic spans, in precedence order (flags g+m so ^ anchors indented-code lines).
// A closed fence wins over an unclosed one; an unclosed fence is opaque to end of input.
const OPAQUE =
  /```[\s\S]*?```|```[\s\S]*|^(?: {4}|\t).*(?:\n(?: {4}|\t).*)*|`[^`\n]+`|https?:\/\/\S+|\{\{[^{}]*\}\}|\{[^{}]*\}|%[a-zA-Z]/gm

function tokenize(text: string, segmenter: Intl.Segmenter): string[] {
  const tokens: string[] = []
  let last = 0
  for (const m of text.matchAll(OPAQUE)) {
    const start = m.index
    if (start > last) for (const s of segmenter.segment(text.slice(last, start))) tokens.push(s.segment)
    tokens.push(m[0])
    last = start + m[0].length
  }
  if (last < text.length) for (const s of segmenter.segment(text.slice(last))) tokens.push(s.segment)
  return tokens
}

/** Coarse whole-replace fallback for oversized / high-edit-distance input. */
function coarse(original: string, result: string): DiffSegment[] {
  if (original === result) return [{ id: 's0', type: 'same', value: original }]
  const segs: DiffSegment[] = []
  if (original !== '') segs.push({ id: 'd0', type: 'del', value: original })
  if (result !== '') segs.push({ id: 'a0', type: 'add', value: result })
  return segs
}

export function createWordDiff(opts: WordDiffOptions = {}): WordDiff {
  const segmenter = opts.segmenter ?? new Intl.Segmenter(undefined, { granularity: 'word' })
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
  const maxEditLength = opts.maxEditLength ?? DEFAULT_MAX_EDIT
  return {
    diff(original, result) {
      if (original.length > maxChars || result.length > maxChars) return coarse(original, result)
      const changes = diffArrays(tokenize(original, segmenter), tokenize(result, segmenter), { maxEditLength })
      if (changes === undefined) return coarse(original, result)
      const segs: DiffSegment[] = []
      let i = 0
      for (const c of changes) {
        const type: DiffSegment['type'] = c.added ? 'add' : c.removed ? 'del' : 'same'
        segs.push({ id: `${type[0]}${i++}`, type, value: c.value.join('') })
      }
      return segs
    },
  }
}

/**
 * Merge a diff back to text given the accepted change ids: `same` is always kept, an `add`
 * appears only if accepted, a `del` is kept only if NOT accepted. So accepting every add+del
 * reproduces the model result exactly; accepting none reproduces the original (rule 66 §2).
 */
export function applyDiff(segments: DiffSegment[], acceptedIds: ReadonlySet<string>): string {
  let out = ''
  for (const seg of segments) {
    if (seg.type === 'same') out += seg.value
    else if (seg.type === 'add') {
      if (acceptedIds.has(seg.id)) out += seg.value
    } else if (!acceptedIds.has(seg.id)) out += seg.value
  }
  return out
}

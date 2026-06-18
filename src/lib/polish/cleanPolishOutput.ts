// Purpose: strip a non-compliant model's surrounding prose from a polish result so the Result tab,
// the Compare word-diff, copy, and Accept all use ONLY the polished text (bug #96). The polish prompt
// already asks for clean output, but some models still wrap the answer in a "Here is …:" preamble,
// surrounding quotes, and a trailing "Changes made:" list. This is a CONSERVATIVE cleaner: it strips
// only unambiguous meta-prose and, when in any doubt, passes the text through unchanged — false
// negatives (leaving some prose) are acceptable; false positives (corrupting real content) are not.
// English-centric by design (the prompt is the cross-language lever); a CJK/RTL preamble is left as-is.

// A model's own framing line, e.g. "Here is the improved sentence:" / "Sure, here's the polished
// version:". Strict template: a "here is/'s" opener, optional article, a POLISHING-ACT word
// (polished/improved/revised/…) directly followed by an optional result-noun, then the colon and
// NOTHING else. Requiring the polishing-act word — not a generic noun — and forbidding subject matter
// before the colon spares genuine content intros ("Here is the text of the agreement…:", "Here is the
// improved algorithm:", "Here is what you need to know about the API:"), which were over-stripped by a
// looser pattern. A bare "Here is the result:" (no polishing-act word) is intentionally left alone.
const PREAMBLE =
  /^(?:(?:sure|certainly|okay|ok|of course|alright|absolutely|got it)[,.!]?\s*)?here(?:'s|\s+is|\s+are)\s+(?:the\s+|your\s+|a\s+)?(?:polished|improved|revised|corrected|refined|edited|updated|cleaned[ -]?up|rewritten|reworded)(?:\s+(?:version|text|draft|sentence|paragraph|result|wording|rewrite|edit|copy))?\s*:\s*$/i

// A SPECIFIC meta heading that introduces a trailing list of edits, e.g. "Changes made:". Deliberately
// NOT bare "Changes:"/"Edits:"/"Notes:" — those are common in real content (changelogs, minutes) and
// matching them silently deletes the user's text (rule 66 §1). Combined with the list-tail guard below.
const CHANGES_HEADING =
  /^(?:changes made|edits made|here(?:'s| is) what (?:i |was )?chang\w*|what (?:i )?changed|summary of (?:the )?changes|list of (?:the )?changes)\s*:\s*$/i

// A bulleted/numbered line — the shape of a model's edit list. The trailing-section strip requires the
// tail to look like a list, so a "Changes made:" followed by prose content is left intact.
const LIST_LINE = /^\s*(?:[-*•‣◦]|\d+[.)])\s+/

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'], // “ ”
  ['‘', '’'], // ‘ ’
]

/** Remove unambiguous model meta-prose, returning only the polished text. Pass-through when unsure. */
export function cleanPolishOutput(raw: string): string {
  const original = raw.trim()
  if (original === '') return ''

  let lines = original.split('\n')
  let strippedMeta = false

  // 1. Trailing changes section — from a standalone "Changes made:"-style heading to the end, but ONLY
  //    when its tail is a bulleted/numbered list (a model's edit list, not prose content). Require
  //    index > 0 so we never strip the entire output.
  const headingIdx = lines.findIndex((l) => CHANGES_HEADING.test(l.trim()))
  if (headingIdx > 0 && lines.slice(headingIdx + 1).some((l) => LIST_LINE.test(l))) {
    lines = lines.slice(0, headingIdx)
    strippedMeta = true
  }

  // 2. Leading preamble — only when the first non-empty line is a meta-intro AND real content follows.
  const firstIdx = lines.findIndex((l) => l.trim() !== '')
  if (firstIdx !== -1 && PREAMBLE.test(lines[firstIdx].trim())) {
    const after = lines.slice(firstIdx + 1).join('\n').trim()
    if (after !== '') {
      lines = lines.slice(firstIdx + 1)
      strippedMeta = true
    }
  }

  let s = lines.join('\n').trim()

  // 3. Surrounding quotes — only once meta-prose marks the model is wrapping its answer (so a bare
  //    quoted result, which may be intentional content, keeps its quotes), and only a clean single
  //    outer pair (no same-quote inside → never corrupt content that contains quotes).
  if (strippedMeta && s.length >= 2) {
    for (const [open, close] of QUOTE_PAIRS) {
      if (s.startsWith(open) && s.endsWith(close)) {
        const inner = s.slice(1, -1)
        if (!inner.includes(open) && !inner.includes(close)) {
          s = inner.trim()
          break
        }
      }
    }
  }

  // Fail-safe: never turn non-empty input into nothing.
  return s === '' ? original : s
}

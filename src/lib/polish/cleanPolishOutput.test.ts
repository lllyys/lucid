import { describe, it, expect } from 'vitest'
import { cleanPolishOutput } from './cleanPolishOutput'

describe('cleanPolishOutput', () => {
  // The exact bug #96 shape: preamble line + quoted sentence + a trailing "Changes made:" list.
  it('strips the preamble, surrounding quotes, and the trailing "Changes made:" list', () => {
    const raw = [
      'Here is the improved sentence:',
      '',
      '"I don\'t want to set up another server for persistence."',
      '',
      'Changes made:',
      '- **"i"** → **"I"** (capitalized the first-person pronoun)',
      '- **"dont"** → **"don\'t"** (added the missing apostrophe)',
    ].join('\n')
    expect(cleanPolishOutput(raw)).toBe("I don't want to set up another server for persistence.")
  })

  it('strips only the leading preamble when there is no trailing changes list', () => {
    expect(cleanPolishOutput("Sure, here's the polished version:\n\nThe cat sat.")).toBe('The cat sat.')
  })

  it('strips a trailing changes section even without a preamble', () => {
    expect(cleanPolishOutput('The cat sat on the mat.\n\nChanges made:\n- fixed grammar')).toBe(
      'The cat sat on the mat.',
    )
  })

  it('unwraps surrounding quotes only once meta-prose marks the model is wrapping its answer', () => {
    expect(cleanPolishOutput('Here is the revised text:\n\n"Polished text."')).toBe('Polished text.')
  })

  it('keeps surrounding quotes when there is no meta-prose (does not unwrap content quotes)', () => {
    expect(cleanPolishOutput('"To be or not to be."')).toBe('"To be or not to be."')
  })

  it('does not unwrap when the span contains the same inner quote (avoids corrupting content)', () => {
    expect(cleanPolishOutput('Here is the revised text:\n\n"He said "hi" to me."')).toBe('"He said "hi" to me."')
  })

  it('never returns empty when the input had content (fail-safe to the trimmed raw)', () => {
    expect(cleanPolishOutput('Here is the improved version:')).toBe('Here is the improved version:')
  })

  it('falls back to the raw when stripping would empty it (empty quoted body after a preamble)', () => {
    // preamble strip + quote-unwrap of `""` would leave "" → fail-safe returns the trimmed raw.
    expect(cleanPolishOutput('Here is the revised text:\n\n""')).toBe('Here is the revised text:\n\n""')
  })

  it.each([
    ['I love translating.', 'I love translating.'],
    ['First line.\n\nSecond paragraph.', 'First line.\n\nSecond paragraph.'],
    ['Ingredients:\n- salt\n- pepper', 'Ingredients:\n- salt\n- pepper'],
    ['The improved algorithm runs in O(n):\n- step one', 'The improved algorithm runs in O(n):\n- step one'],
    ['  padded text.  ', 'padded text.'],
    ['', ''],
    ['   \n  ', ''],
  ])('passes clean / non-meta input through unchanged: %j', (raw, expected) => {
    expect(cleanPolishOutput(raw)).toBe(expected)
  })

  // Over-stripping guards (audit round 1): legitimate content with meta-LOOKING markers must survive,
  // never silently dropping a paragraph (rule 66 §1).
  it.each([
    // a real "Notes:" content section (the audit's corrupting input) — bare Notes:/Changes: are NOT meta
    ['The migration completed.\n\nNotes:\nRemember to back up the database.', 'The migration completed.\n\nNotes:\nRemember to back up the database.'],
    ['v2 ships today.\n\nChanges:\nFaster startup.', 'v2 ships today.\n\nChanges:\nFaster startup.'],
    // "Changes made:" followed by PROSE (not a list) — kept intact by the list-tail guard
    ['The cat sat.\n\nChanges made:\nI corrected the grammar.', 'The cat sat.\n\nChanges made:\nI corrected the grammar.'],
    // genuine "Here is …:" content intros — no POLISHING-ACT word, so not a model preamble
    ['Here is what you need to know about the API:\n\nAll endpoints require auth.', 'Here is what you need to know about the API:\n\nAll endpoints require auth.'],
    ['Here is the text of the agreement that both parties signed:\n\nThe parties agree to the following terms.', 'Here is the text of the agreement that both parties signed:\n\nThe parties agree to the following terms.'],
    ['Here is the final version of the contract:\n\nAll terms apply.', 'Here is the final version of the contract:\n\nAll terms apply.'],
    ['Here is the result of our investigation:\n\nNo issues were found.', 'Here is the result of our investigation:\n\nNo issues were found.'],
    // a polishing-act word buried in genuine content (subject matter before the colon) — not a preamble
    ['Here is the improved algorithm we discussed:\n\nIt runs in O(n).', 'Here is the improved algorithm we discussed:\n\nIt runs in O(n).'],
  ])('preserves legitimate content with meta-looking markers (over-strip guard): %j', (raw, expected) => {
    expect(cleanPolishOutput(raw)).toBe(expected)
  })

  it('still strips a real "Changes made:" + bulleted list (the bug shape, list-tail present)', () => {
    expect(cleanPolishOutput('The cat sat.\n\nChanges made:\n- cat → dog\n- fixed casing')).toBe('The cat sat.')
  })

  it('does not empty a result whose first line IS a "Changes made:" list (headingIdx > 0 guard)', () => {
    // pathological: the heading is at index 0 → the > 0 guard refuses to strip the whole output.
    expect(cleanPolishOutput('Changes made:\n- buy milk\n- buy eggs')).toBe('Changes made:\n- buy milk\n- buy eggs')
  })
})

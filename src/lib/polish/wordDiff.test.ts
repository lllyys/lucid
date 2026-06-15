import { describe, it, expect } from 'vitest'
import { createWordDiff, applyDiff, type DiffSegment } from './wordDiff'

const wd = createWordDiff()
const acceptableIds = (segs: DiffSegment[]) => new Set(segs.filter((s) => s.type !== 'same').map((s) => s.id))

describe('createWordDiff().diff — core invariants (rule 66 §2)', () => {
  it('whole-result accept reproduces the result string EXACTLY', () => {
    const o = 'the quick brown fox'
    const r = 'the slow brown fox jumps'
    const segs = wd.diff(o, r)
    expect(applyDiff(segs, acceptableIds(segs))).toBe(r)
  })

  it('none accepted reproduces the original exactly', () => {
    const o = 'the quick brown fox'
    const r = 'the slow brown fox jumps'
    expect(applyDiff(wd.diff(o, r), new Set())).toBe(o)
  })

  it('a partial subset yields the expected mixed text', () => {
    const o = 'cat dog'
    const r = 'cat bird'
    const segs = wd.diff(o, r)
    const addsOnly = new Set(segs.filter((s) => s.type === 'add').map((s) => s.id))
    const mixed = applyDiff(segs, addsOnly)
    expect(mixed).toContain('bird') // accepted addition appears
    expect(mixed).toContain('dog') // unaccepted deletion keeps the original word
  })

  it('classifies same / add / del and assigns unique ids', () => {
    const segs = wd.diff('cat dog', 'cat bird')
    expect(segs.map((s) => s.type)).toContain('same')
    expect(segs.map((s) => s.type)).toContain('add')
    expect(segs.map((s) => s.type)).toContain('del')
    const ids = segs.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('identical input is all-same and round-trips', () => {
    const segs = wd.diff('same text here', 'same text here')
    expect(segs.every((s) => s.type === 'same')).toBe(true)
    expect(applyDiff(segs, new Set())).toBe('same text here')
  })

  it('handles empty original, empty result, and empty-to-empty', () => {
    const add = wd.diff('', 'added')
    expect(applyDiff(add, acceptableIds(add))).toBe('added')
    expect(applyDiff(wd.diff('removed', ''), new Set())).toBe('removed')
    expect(wd.diff('', '')).toEqual([])
  })
})

describe('createWordDiff().diff — structure preservation (rule 66 §1)', () => {
  it.each([
    ['fenced code', '```ts\nconst x = `1`\n```'],
    ['inline code', '`pnpm dev`'],
    ['a URL', 'https://example.com/a?b=1&c=2'],
    ['a {name} placeholder', '{name}'],
    ['a {{count}} placeholder', '{{count}}'],
    ['a %s placeholder', '%s'],
  ])('keeps %s intact (opaque, never split) across an adjacent edit', (_label, span) => {
    const o = `before ${span} after`
    const r = `changed ${span} after`
    const segs = wd.diff(o, r)
    expect(applyDiff(segs, acceptableIds(segs))).toBe(r) // exact → no opaque span split/dropped
    expect(applyDiff(segs, acceptableIds(segs))).toContain(span)
  })

  it('keeps an indented code block (line-anchored) intact', () => {
    const o = 'intro\n    const indented = 1\nafter'
    const r = 'changed\n    const indented = 1\nafter'
    const segs = wd.diff(o, r)
    expect(applyDiff(segs, acceptableIds(segs))).toBe(r)
    expect(applyDiff(segs, acceptableIds(segs))).toContain('    const indented = 1')
  })

  it('handles an opaque span at the very start (no leading prose)', () => {
    const o = '`code` then text'
    const r = '`code` then other'
    const segs = wd.diff(o, r)
    expect(applyDiff(segs, acceptableIds(segs))).toBe(r)
    expect(applyDiff(segs, acceptableIds(segs))).toContain('`code`')
  })

  it('treats an unclosed fence as opaque to end of input', () => {
    const o = 'intro\n```ts\nunclosed code'
    const segs = wd.diff(o, o)
    expect(segs.every((s) => s.type === 'same')).toBe(true)
    expect(applyDiff(segs, new Set())).toBe(o)
  })

  it('preserves exact whitespace (round-trips multi-space + newlines)', () => {
    const o = 'a   b\n\n  c'
    expect(applyDiff(wd.diff(o, o), new Set())).toBe(o)
  })
})

describe('createWordDiff().diff — size guards (Phase-0)', () => {
  it('coarse whole-replace when input exceeds maxChars', () => {
    const tiny = createWordDiff({ maxChars: 10 })
    const o = 'this original is long'
    const r = 'this result is long too'
    const segs = tiny.diff(o, r)
    expect(segs.map((s) => s.type)).toEqual(['del', 'add'])
    expect(applyDiff(segs, acceptableIds(segs))).toBe(r)
    expect(applyDiff(segs, new Set())).toBe(o)
  })

  it('coarse fallback: identical oversized input is a single same segment', () => {
    const big = 'x'.repeat(50)
    expect(createWordDiff({ maxChars: 10 }).diff(big, big)).toEqual([{ id: 's0', type: 'same', value: big }])
  })

  it('coarse fallback: empty↔oversized peer yields a single add or del', () => {
    const big = 'y'.repeat(50)
    expect(createWordDiff({ maxChars: 10 }).diff('', big).map((s) => s.type)).toEqual(['add'])
    expect(createWordDiff({ maxChars: 10 }).diff(big, '').map((s) => s.type)).toEqual(['del'])
  })

  it('coarse fallback when the edit distance exceeds maxEditLength', () => {
    const bounded = createWordDiff({ maxEditLength: 1 })
    expect(bounded.diff('a b c d e', 'v w x y z').map((s) => s.type)).toEqual(['del', 'add'])
  })
})

describe('createWordDiff().diff — CJK + bidi (rule 66 §3/§4)', () => {
  // Deterministic stub segmenter (codepoint split) — asserts structural invariants, not
  // ICU boundaries (Phase-0: ICU boundaries are runtime-stable but version-dependent).
  const stub = {
    segment: (s: string) => Array.from(s).map((c) => ({ segment: c })),
  } as unknown as Intl.Segmenter
  const cjk = createWordDiff({ segmenter: stub })

  it('diffs CJK without losing characters', () => {
    const o = '该模型调整权重'
    const r = '该模型调整其权重'
    const segs = cjk.diff(o, r)
    expect(applyDiff(segs, acceptableIds(segs))).toBe(r)
    expect(applyDiff(segs, new Set())).toBe(o)
  })

  it('round-trips Arabic / Hebrew / mixed-bidi exactly', () => {
    const cases: Array<[string, string]> = [
      ['مرحبا بالعالم', 'مرحبا أيها العالم'],
      ['שלום עולם', 'שלום עולם יפה'],
      ['code 中 محتوى', 'code 中 محتوى!'],
    ]
    for (const [o, r] of cases) expect(applyDiff(cjk.diff(o, r), acceptableIds(cjk.diff(o, r)))).toBe(r)
  })

  it('does not split emoji / ZWJ sequences (real grapheme-aware segmenter)', () => {
    const o = 'family 👨‍👩‍👧 ok'
    const r = 'family 👨‍👩‍👧 done'
    expect(applyDiff(wd.diff(o, r), acceptableIds(wd.diff(o, r)))).toBe(r)
  })
})

describe('applyDiff', () => {
  const segs: DiffSegment[] = [
    { id: 's0', type: 'same', value: 'keep ' },
    { id: 'd1', type: 'del', value: 'old' },
    { id: 'a2', type: 'add', value: 'new' },
    { id: 's3', type: 'same', value: ' end' },
  ]

  it('same is always kept; add only if accepted; del only if NOT accepted', () => {
    expect(applyDiff(segs, new Set())).toBe('keep old end') // reject all → original
    expect(applyDiff(segs, new Set(['d1', 'a2']))).toBe('keep new end') // accept all → result
    expect(applyDiff(segs, new Set(['a2']))).toBe('keep oldnew end') // accept add only
    expect(applyDiff(segs, new Set(['d1']))).toBe('keep  end') // accept del only
  })
})

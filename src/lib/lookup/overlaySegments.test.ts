import { describe, it, expect } from 'vitest'
import { wordSegments } from './overlaySegments'

// WI-2 — word-only segments + [start,end) offsets for the editable-lookup mirror overlay (#169).

describe('wordSegments', () => {
  it('returns word segments with start/end offsets for ASCII', () => {
    const segs = wordSegments('Hello, world!')
    expect(segs).toEqual([
      { text: 'Hello', start: 0, end: 5 },
      { text: 'world', start: 7, end: 12 },
    ])
  })

  it('excludes gaps (punctuation + whitespace)', () => {
    const segs = wordSegments('a, b')
    expect(segs.map((s) => s.text)).toEqual(['a', 'b'])
  })

  it('returns [] for empty text', () => {
    expect(wordSegments('')).toEqual([])
  })

  it('uses the default locale when none is passed', () => {
    expect(wordSegments('two words').map((s) => s.text)).toEqual(['two', 'words'])
  })

  it('segments CJK (no inter-word spaces) with offsets that slice back to the word', () => {
    const text = '你好世界'
    const segs = wordSegments(text, 'zh')
    expect(segs.length).toBeGreaterThan(0)
    let prevEnd = 0
    for (const s of segs) {
      expect(s.start).toBeGreaterThanOrEqual(prevEnd)
      expect(s.end).toBe(s.start + s.text.length)
      expect(text.slice(s.start, s.end)).toBe(s.text)
      prevEnd = s.end
    }
  })

  it('segments Arabic (RTL) words with correct UTF-16 offsets', () => {
    const text = 'مرحبا بالعالم'
    const segs = wordSegments(text, 'ar')
    expect(segs.length).toBeGreaterThanOrEqual(2)
    for (const s of segs) expect(text.slice(s.start, s.end)).toBe(s.text)
  })

  it('handles mixed-script (Latin + CJK) without dropping words or misaligning offsets', () => {
    const text = 'code 代码 ok'
    const segs = wordSegments(text)
    const words = segs.map((s) => s.text)
    expect(words).toContain('code')
    expect(words).toContain('ok')
    for (const s of segs) expect(text.slice(s.start, s.end)).toBe(s.text)
  })
})

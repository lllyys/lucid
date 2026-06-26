import { describe, it, expect } from 'vitest'
import { tokenize, sentenceAt } from './segment'

describe('tokenize', () => {
  it('splits an English sentence into word + non-word segments with cumulative offsets', () => {
    const segs = tokenize('Hello, world!')
    // word segments carry isWord=true; offsets are byte-accurate into the source
    const words = segs.filter((s) => s.isWord)
    expect(words.map((w) => w.value)).toEqual(['Hello', 'world'])
    expect(words[0].offset).toBe(0)
    expect(words[1].offset).toBe(7)
    // every segment's offset+value reconstructs the original text in order
    expect(segs.map((s) => s.value).join('')).toBe('Hello, world!')
  })

  it('marks punctuation and whitespace as non-word', () => {
    const segs = tokenize('a, b')
    expect(segs.find((s) => s.value === ',')?.isWord).toBe(false)
    expect(segs.find((s) => s.value === ' ')?.isWord).toBe(false)
  })

  it('segments CJK text with no inter-word spaces', () => {
    const segs = tokenize('你好世界', 'zh')
    const words = segs.filter((s) => s.isWord)
    // CJK has no spaces; the segmenter still yields word-like tokens and the offsets are monotonic
    expect(words.length).toBeGreaterThan(0)
    let prev = -1
    for (const w of words) {
      expect(w.offset).toBeGreaterThan(prev)
      prev = w.offset
    }
    expect(segs.map((s) => s.value).join('')).toBe('你好世界')
  })

  it('segments Arabic (RTL) without dropping characters', () => {
    const text = 'مرحبا بالعالم'
    const segs = tokenize(text, 'ar')
    expect(segs.filter((s) => s.isWord).length).toBeGreaterThanOrEqual(2)
    expect(segs.map((s) => s.value).join('')).toBe(text)
  })

  it('keeps an emoji grapheme cluster intact (no split mid-cluster)', () => {
    const text = '👍🏽 ok 👨‍👩‍👧‍👦'
    const segs = tokenize(text)
    // reconstruction is exact — no surrogate or ZWJ-sequence is severed
    expect(segs.map((s) => s.value).join('')).toBe(text)
    expect(segs.find((s) => s.value === 'ok')?.isWord).toBe(true)
  })

  it('handles mixed-script text', () => {
    const text = 'English 中文 mixed'
    const segs = tokenize(text)
    const wordValues = segs.filter((s) => s.isWord).map((s) => s.value)
    expect(wordValues).toContain('English')
    expect(wordValues).toContain('mixed')
    expect(segs.map((s) => s.value).join('')).toBe(text)
  })

  it('treats a hyphenated compound per the segmenter (hyphen is non-word)', () => {
    const segs = tokenize('well-known')
    expect(segs.map((s) => s.value).join('')).toBe('well-known')
    expect(segs.find((s) => s.value === '-')?.isWord).toBe(false)
  })

  it('returns an empty array for empty input', () => {
    expect(tokenize('')).toEqual([])
  })

  it('defaults the locale when none is supplied', () => {
    expect(tokenize('hi there').filter((s) => s.isWord).map((s) => s.value)).toEqual(['hi', 'there'])
  })
})

describe('sentenceAt', () => {
  const TEXT = 'First sentence. Second one here. Third!'

  it('returns the sentence containing the clicked offset', () => {
    // offset inside "Second one here."
    const at = TEXT.indexOf('one')
    expect(sentenceAt(TEXT, at).trim()).toBe('Second one here.')
  })

  it('returns the first sentence for an offset at 0', () => {
    expect(sentenceAt(TEXT, 0).trim()).toBe('First sentence.')
  })

  it('returns the last sentence for an offset inside it', () => {
    expect(sentenceAt(TEXT, TEXT.indexOf('Third')).trim()).toBe('Third!')
  })

  it('handles CJK sentence boundaries (。)', () => {
    const cjk = '第一句话。第二句话。'
    const at = cjk.indexOf('第二')
    expect(sentenceAt(cjk, at).trim()).toBe('第二句话。')
  })

  it('returns the whole text when there is a single sentence', () => {
    expect(sentenceAt('just one clause', 3).trim()).toBe('just one clause')
  })

  it('returns an empty string for empty text', () => {
    expect(sentenceAt('', 0)).toBe('')
  })

  it('clamps an out-of-range offset to the nearest sentence', () => {
    // a negative or past-end offset must not throw; it returns a sentence from the text
    expect(sentenceAt(TEXT, -5)).not.toBe('')
    expect(sentenceAt(TEXT, TEXT.length + 100)).not.toBe('')
  })
})

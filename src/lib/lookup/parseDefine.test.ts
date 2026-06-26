import { describe, it, expect } from 'vitest'
import { parseDefine } from './parseDefine'

// Synthetic fixtures only — assert SHAPE/PRESENCE, never an exact IPA/word (rule 66 §4).
const FULL = JSON.stringify({
  word: 'stutter',
  ipa: '/synthetic/',
  partOfSpeech: 'noun',
  translations: ['t1', 't2', 't3'],
  meaning: 'a synthetic in-context meaning',
  senses: [
    { gloss: 'g1', meaning: 'm1' },
    { gloss: 'g2', meaning: 'm2' },
  ],
})

describe('parseDefine — complete JSON', () => {
  it('extracts every field from a complete object', () => {
    const r = parseDefine(FULL)
    expect(r.usable).toBe(true)
    expect(r.word).toEqual(expect.any(String))
    expect(r.word!.length).toBeGreaterThan(0)
    expect(r.ipa).toEqual(expect.any(String))
    expect(r.partOfSpeech).toEqual(expect.any(String))
    expect(r.translations.length).toBe(3)
    expect(r.meaning!.length).toBeGreaterThan(0)
    expect(r.senses.length).toBe(2)
    expect(r.senses[0]).toMatchObject({ gloss: expect.any(String), meaning: expect.any(String) })
  })

  it('tolerates a markdown-fenced JSON object', () => {
    const r = parseDefine('```json\n' + FULL + '\n```')
    expect(r.usable).toBe(true)
    expect(r.word!.length).toBeGreaterThan(0)
  })

  it('tolerates leading/trailing prose around the object', () => {
    const r = parseDefine('Here you go: ' + FULL + ' — done.')
    expect(r.usable).toBe(true)
    expect(r.translations.length).toBe(3)
  })
})

describe('parseDefine — partial / streaming JSON', () => {
  it('yields word + ipa early from an incomplete object', () => {
    const partial = '{"word":"stutter","ipa":"/synthetic/","translations":["t1"'
    const r = parseDefine(partial)
    expect(r.word).toBe('stutter')
    expect(r.ipa).toBe('/synthetic/')
    // translations may be partially filled or empty — but the parse never throws
    expect(Array.isArray(r.translations)).toBe(true)
  })

  it('fills translations/meaning/senses as more of the stream arrives', () => {
    const more = '{"word":"x","ipa":"/y/","translations":["a","b"],"meaning":"partial mean'
    const r = parseDefine(more)
    expect(r.word).toBe('x')
    expect(r.translations).toEqual(['a', 'b'])
  })

  it('does not throw on a half-open brace with no fields yet', () => {
    expect(() => parseDefine('{"wo')).not.toThrow()
    expect(parseDefine('{"wo').usable).toBe(false)
  })

  it('recovers a complete prefix when the stream is cut mid-number value', () => {
    const r = parseDefine('{"word":"w","count":12')
    expect(r.word).toBe('w')
    expect(r.usable).toBe(true)
  })

  it('recovers when the stream is cut right after a complete number value', () => {
    const r = parseDefine('{"word":"w","n":5,"meaning":"m')
    expect(r.word).toBe('w')
    expect(r.usable).toBe(true)
  })

  it('handles whitespace and newlines inside a truncated object', () => {
    const r = parseDefine('{\n  "word": "spaced" ,\n  "ipa": "/x/"\n  ,"translations": [ "a" ')
    expect(r.word).toBe('spaced')
    expect(r.translations).toEqual(['a'])
  })

  it('preserves an escaped quote inside a value string', () => {
    const r = parseDefine('{"word":"w","meaning":"a \\"quoted\\" meaning"}')
    expect(r.meaning).toContain('quoted')
  })

  it('treats an empty-string field as absent (not usable on its own)', () => {
    expect(parseDefine(JSON.stringify({ word: '', ipa: '' })).usable).toBe(false)
  })

  it('preserves an escaped quote inside a TRUNCATED value string (repair path)', () => {
    // unterminated value string containing an escape — the prior complete word is recovered
    const r = parseDefine('{"word":"w","meaning":"a \\"partial')
    expect(r.word).toBe('w')
  })

  it('does not crash on a stray literal token in key position (malformed prefix)', () => {
    // a bare number where a key is expected is malformed; repair must not treat it as a safe cut
    const r = parseDefine('{"word":"w" 5')
    expect(r.word).toBe('w')
    expect(r.usable).toBe(true)
  })
})

describe('parseDefine — error sentinels', () => {
  it('marks an empty string as not usable', () => {
    expect(parseDefine('').usable).toBe(false)
  })

  it('marks whitespace-only as not usable', () => {
    expect(parseDefine('   \n ').usable).toBe(false)
  })

  it('marks an object with no word AND no meaning as not usable', () => {
    expect(parseDefine(JSON.stringify({ ipa: '/x/' })).usable).toBe(false)
  })

  it('is usable if it has a word even without a meaning yet', () => {
    expect(parseDefine(JSON.stringify({ word: 'w' })).usable).toBe(true)
  })

  it('is usable if it has a meaning even without a word field', () => {
    expect(parseDefine(JSON.stringify({ meaning: 'm' })).usable).toBe(true)
  })

  it('marks malformed non-JSON garbage as not usable', () => {
    expect(parseDefine('not json at all !!!').usable).toBe(false)
  })
})

describe('parseDefine — does not confuse the input sentence', () => {
  it('keys only on the model object; a sentence with JSON metacharacters does not break parsing', () => {
    // The echoed sentence could contain braces; the parser reads the model's emitted object only.
    const text = JSON.stringify({
      word: 'frame',
      meaning: 'a meaning that mentions {"fake":"object"} inline',
      translations: ['帧'],
    })
    const r = parseDefine(text)
    expect(r.word).toBe('frame')
    expect(r.translations).toEqual(['帧'])
    expect(r.meaning).toContain('fake')
  })

  it('ignores non-string array entries in translations', () => {
    const text = '{"word":"w","translations":["ok",123,null,"two"]}'
    const r = parseDefine(text)
    expect(r.translations).toEqual(['ok', 'two'])
  })

  it('ignores malformed sense entries', () => {
    const text = '{"word":"w","senses":[{"gloss":"g","meaning":"m"},{"gloss":"only"},"bad",42]}'
    const r = parseDefine(text)
    expect(r.senses).toEqual([{ gloss: 'g', meaning: 'm' }])
  })
})

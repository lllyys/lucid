import { describe, it, expect } from 'vitest'
import { extractTerms } from './extractTerms'

describe('extractTerms', () => {
  it('extracts multi-word capitalized phrases', () => {
    expect(extractTerms('We study Quantum Computing every day.')).toContain('Quantum Computing')
  })

  it('extracts all-caps acronyms (≥2 letters)', () => {
    expect(extractTerms('The GPU runs the model.')).toContain('GPU')
  })

  it('extracts repeated lowercase technical tokens (≥4 chars, ≥2×)', () => {
    const terms = extractTerms('the neural network and the neural network model model model')
    expect(terms).toContain('neural')
    expect(terms).toContain('network')
    expect(terms).toContain('model')
  })

  it('does not extract short or single-occurrence words', () => {
    const terms = extractTerms('the cat sat on a mat once')
    expect(terms).toEqual([]) // "the" len3, all others single-occurrence, no caps/acronyms
  })

  it('excludes terms already in the existing glossary (case-insensitive)', () => {
    expect(extractTerms('Quantum Computing and Quantum Computing', ['quantum computing'])).toEqual([])
  })

  it('de-dupes case-insensitively', () => {
    const terms = extractTerms('GPU gpu GPU')
    expect(terms.filter((t) => t.toLowerCase() === 'gpu')).toHaveLength(1)
  })

  it('returns none for case-less scripts (CJK) — documented v1 Latin limitation', () => {
    expect(extractTerms('你好世界 你好世界 机器学习 机器学习')).toEqual([])
  })

  it('returns none for empty / punctuation-only / whitespace input', () => {
    expect(extractTerms('')).toEqual([])
    expect(extractTerms('!!! ??? ... ,,,')).toEqual([])
    expect(extractTerms('   ')).toEqual([])
  })

  it('caps the result at 8 terms', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golff', 'hotel', 'india', 'juliet', 'kiloo', 'limaa']
    const text = words.map((w) => `${w} ${w}`).join(' ') // 12 distinct, each repeated ≥2× → 12 candidates
    expect(extractTerms(text).length).toBe(8)
  })
})

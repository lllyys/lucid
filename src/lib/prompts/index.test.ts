import { describe, it, expect } from 'vitest'
import { buildPrompt, validateRequest, MAX_INPUT_CHARS } from './index'
import type { PolishGoal, TranslateRequest, PolishRequest } from '@/providers/types'
import { POLISH_GOALS } from '@/providers/types'

const translate = (over: Partial<TranslateRequest> = {}): TranslateRequest => ({
  kind: 'translate',
  text: 'Hello world',
  targetLang: 'es',
  ...over,
})
const polish = (over: Partial<PolishRequest> = {}): PolishRequest => ({
  kind: 'polish',
  text: 'Hello world',
  goal: 'clarity',
  ...over,
})

describe('buildPrompt — translate', () => {
  it('names the target language and includes the structure-preservation instruction', () => {
    const { system, user } = buildPrompt(translate({ targetLang: 'fr' }))
    expect(system).toContain('fr')
    expect(system.toLowerCase()).toContain('preserve')
    expect(system.toLowerCase()).toMatch(/code|markdown|placeholder/)
    expect(user).toBe('Hello world')
  })
  it('mentions the source language when provided, omits it otherwise', () => {
    expect(buildPrompt(translate({ sourceLang: 'de' })).system).toContain('de')
    expect(buildPrompt(translate()).system).not.toMatch(/\bfrom\b/)
  })
})

describe('buildPrompt — polish', () => {
  it.each(POLISH_GOALS)('includes a goal-specific instruction for %s', (goal) => {
    const { system, user } = buildPrompt(polish({ goal }))
    expect(system.length).toBeGreaterThan(20)
    expect(system.toLowerCase()).toContain('preserve')
    expect(user).toBe('Hello world')
  })
  it('mentions the language when provided', () => {
    expect(buildPrompt(polish({ lang: 'ja' })).system).toContain('ja')
  })
  it('produces a different instruction per goal', () => {
    const systems = POLISH_GOALS.map((goal) => buildPrompt(polish({ goal })).system)
    expect(new Set(systems).size).toBe(POLISH_GOALS.length)
  })
})

describe('validateRequest', () => {
  it('rejects empty / whitespace-only input', () => {
    expect(validateRequest(translate({ text: '' }))?.kind).toBe('validation')
    expect(validateRequest(translate({ text: '   \n\t ' }))?.kind).toBe('validation')
  })
  it('rejects input larger than MAX_INPUT_CHARS', () => {
    expect(validateRequest(translate({ text: 'a'.repeat(MAX_INPUT_CHARS + 1) }))?.kind).toBe('validation')
  })
  it('rejects an empty target language', () => {
    expect(validateRequest(translate({ targetLang: '  ' }))?.kind).toBe('validation')
  })
  it('rejects an unknown polish goal', () => {
    expect(validateRequest(polish({ goal: 'sarcastic' as PolishGoal }))?.kind).toBe('validation')
  })
  it('accepts a valid translate request', () => {
    expect(validateRequest(translate())).toBeUndefined()
  })
  it('accepts a valid polish request', () => {
    expect(validateRequest(polish({ goal: 'grammar' }))).toBeUndefined()
  })
  it('never leaks the input text into the error detail', () => {
    const err = validateRequest(translate({ text: 'a'.repeat(MAX_INPUT_CHARS + 1) }))
    expect(err?.detail ?? '').not.toContain('aaaa')
  })
})

describe('structure preservation — domain fixtures pass through verbatim', () => {
  const fixtures: Array<[string, string]> = [
    ['CJK (no word spaces)', '你好世界，这是一个测试。'],
    ['Arabic (RTL)', 'مرحبا بالعالم'],
    ['Hebrew (RTL)', 'שלום עולם'],
    ['mixed script', 'English 中文 العربية mixed'],
    ['emoji / grapheme clusters', '👍🏽 family 👨‍👩‍👧‍👦 done'],
    ['placeholders', 'Hi {name}, you have %s items and {{count}} left'],
    ['markdown list', '- one\n- two\n  - nested'],
    ['fenced code', '```ts\nconst x = 1\n```'],
    ['inline code + URL', 'Run `pnpm dev` and open https://example.com/a?b=1'],
  ]
  it.each(fixtures)('passes %s through to the model verbatim', (_label, text) => {
    expect(buildPrompt(translate({ text })).user).toBe(text)
    expect(buildPrompt(polish({ text })).user).toBe(text)
  })
})

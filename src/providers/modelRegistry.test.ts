import { describe, it, expect } from 'vitest'
import {
  REGISTRY,
  resolveModel,
  capabilityOf,
  modelChain,
  isVendorImplemented,
  type ModelCapability,
} from './modelRegistry'
import type { Vendor } from './types'

describe('REGISTRY', () => {
  it('defaults Anthropic to claude-fable-5 with the current Opus/Sonnet fallbacks (rule 65 §2)', () => {
    expect(REGISTRY.anthropic.defaultModel).toBe('claude-fable-5')
    expect(REGISTRY.anthropic.fallbacks).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6'])
    expect(REGISTRY.anthropic.implemented).toBe(true)
  })
  it('every Anthropic model entry has complete ModelCapability metadata', () => {
    for (const model of Object.values(REGISTRY.anthropic.models)) {
      const cap: ModelCapability = model
      expect(cap.id).toBeTruthy()
      expect(cap.contextWindow).toBeGreaterThan(0)
      expect(cap.maxOutputTokens).toBeGreaterThan(0)
      expect(typeof cap.streaming).toBe('boolean')
      expect(typeof cap.vision).toBe('boolean')
      expect(['low', 'medium', 'high']).toContain(cap.costTier)
    }
  })
  it('the default + every fallback id exists in models', () => {
    const { defaultModel, fallbacks, models } = REGISTRY.anthropic
    expect(models[defaultModel]).toBeDefined()
    for (const f of fallbacks) expect(models[f]).toBeDefined()
  })
  it('matches the documented Anthropic limits (claude-api skill catalog)', () => {
    const m = REGISTRY.anthropic.models
    expect(m['claude-fable-5']).toMatchObject({ contextWindow: 1_000_000, maxOutputTokens: 128_000, costTier: 'high' })
    expect(m['claude-opus-4-8']).toMatchObject({ contextWindow: 1_000_000, maxOutputTokens: 128_000, costTier: 'high' })
    expect(m['claude-sonnet-4-6']).toMatchObject({ contextWindow: 1_000_000, maxOutputTokens: 64_000, costTier: 'medium' })
  })
})

describe('isVendorImplemented', () => {
  it('all registered vendors are implemented (#5 WI-4 wired openai/gemini/ollama into the factory)', () => {
    for (const v of ['anthropic', 'openai', 'gemini', 'ollama', 'custom'] as Vendor[]) {
      expect(isVendorImplemented(v)).toBe(true)
    }
  })
})

describe('openai/gemini/ollama model data (#5 — real IDs, allowAnyModel)', () => {
  it('openai defaults to gpt-5.5 with the cheaper fallbacks, allowAnyModel', () => {
    expect(REGISTRY.openai.defaultModel).toBe('gpt-5.5')
    expect(REGISTRY.openai.fallbacks).toEqual(['gpt-5.4-mini', 'gpt-5.4-nano'])
    expect(REGISTRY.openai.allowAnyModel).toBe(true)
  })
  it('gemini defaults to the GA gemini-3.5-flash (+ flash-lite), allowAnyModel (Pro tier is preview-only)', () => {
    expect(REGISTRY.gemini.defaultModel).toBe('gemini-3.5-flash')
    expect(REGISTRY.gemini.fallbacks).toEqual(['gemini-3.1-flash-lite'])
    expect(REGISTRY.gemini.allowAnyModel).toBe(true)
  })
  it('ollama defaults to llama3.2, allowAnyModel (models are user-installed, no fixed catalog)', () => {
    expect(REGISTRY.ollama.defaultModel).toBe('llama3.2')
    expect(REGISTRY.ollama.fallbacks).toEqual([])
    expect(REGISTRY.ollama.allowAnyModel).toBe(true)
  })
  it('resolveModel returns a user-supplied model as-is for these (allowAnyModel — IDs drift, registry is the swap point)', () => {
    expect(resolveModel('openai', 'gpt-6')).toBe('gpt-6')
    expect(resolveModel('gemini', 'gemini-4-pro')).toBe('gemini-4-pro')
    expect(resolveModel('ollama', 'mistral-large')).toBe('mistral-large')
  })
  it('resolveModel falls back to the default when nothing is requested', () => {
    expect(resolveModel('openai')).toBe('gpt-5.5')
    expect(resolveModel('gemini')).toBe('gemini-3.5-flash')
    expect(resolveModel('ollama')).toBe('llama3.2')
  })
  it('modelChain gives the picker list [default, ...fallbacks]', () => {
    expect(modelChain('openai')).toEqual(['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano'])
    expect(modelChain('gemini')).toEqual(['gemini-3.5-flash', 'gemini-3.1-flash-lite'])
    expect(modelChain('ollama')).toEqual(['llama3.2'])
  })
})

describe('custom provider registry (#7 — allowAnyModel)', () => {
  it('resolveModel returns the user-supplied model as-is (no fixed catalog)', () => {
    expect(resolveModel('custom', 'llama-3.1-70b')).toBe('llama-3.1-70b')
  })
  it('resolveModel returns "" when no model is supplied for custom', () => {
    expect(resolveModel('custom')).toBe('')
  })
  it('capabilityOf is undefined for any custom model (fallback max-tokens applies)', () => {
    expect(capabilityOf('custom', 'anything')).toBeUndefined()
  })
})

describe('resolveModel', () => {
  it('returns a requested model that exists', () => {
    expect(resolveModel('anthropic', 'claude-opus-4-8')).toBe('claude-opus-4-8')
  })
  it('falls back to the default for an unknown requested model', () => {
    expect(resolveModel('anthropic', 'made-up-model')).toBe('claude-fable-5')
  })
  it('uses the default when nothing is requested', () => {
    expect(resolveModel('anthropic')).toBe('claude-fable-5')
  })
})

describe('capabilityOf', () => {
  it('returns the capability for a known model', () => {
    expect(capabilityOf('anthropic', 'claude-fable-5')?.maxOutputTokens).toBeGreaterThan(0)
  })
  it('returns undefined for an unknown model', () => {
    expect(capabilityOf('anthropic', 'nope')).toBeUndefined()
  })
})

describe('modelChain', () => {
  it('default selection -> [default, ...fallbacks]', () => {
    expect(modelChain('anthropic')).toEqual(['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-4-6'])
  })
  it('selecting a fallback puts it first and dedupes it from the tail', () => {
    expect(modelChain('anthropic', 'claude-opus-4-8')).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6'])
  })
  it('an unknown selection resolves to the default chain', () => {
    expect(modelChain('anthropic', 'bogus')).toEqual(['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-4-6'])
  })
})

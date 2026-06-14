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
})

describe('isVendorImplemented', () => {
  it('anthropic is implemented; the other three are not (until #2)', () => {
    expect(isVendorImplemented('anthropic')).toBe(true)
    for (const v of ['openai', 'gemini', 'ollama'] as Vendor[]) {
      expect(isVendorImplemented(v)).toBe(false)
    }
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

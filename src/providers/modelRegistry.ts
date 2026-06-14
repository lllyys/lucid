// Purpose: the single source of truth for model IDs + capability metadata and
// ordered fallbacks (rule 65 §2). No model-ID literal lives anywhere else. Each
// provider defaults to its latest capable model; the ordered fallback list is
// what `withFallback` (base.ts) walks so a model degrades without code changes.
//
// Anthropic IDs are per the claude-api skill (latest: claude-fable-5, then
// claude-opus-4-8, claude-sonnet-4-6). The other vendors are registered but not
// yet implemented (#2) — the store/factory refuse to select or construct them.

import type { Vendor } from './types'

export interface ModelCapability {
  id: string
  contextWindow: number
  maxOutputTokens: number
  streaming: boolean
  vision: boolean
  costTier: 'low' | 'medium' | 'high'
}

export interface VendorRegistryEntry {
  vendor: Vendor
  implemented: boolean
  defaultModel: string
  fallbacks: string[]
  models: Record<string, ModelCapability>
}

const ANTHROPIC_MODELS: Record<string, ModelCapability> = {
  'claude-fable-5': {
    id: 'claude-fable-5',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    streaming: true,
    vision: true,
    costTier: 'high',
  },
  'claude-opus-4-8': {
    id: 'claude-opus-4-8',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    streaming: true,
    vision: true,
    costTier: 'high',
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    streaming: true,
    vision: true,
    costTier: 'medium',
  },
}

export const REGISTRY: Record<Vendor, VendorRegistryEntry> = {
  anthropic: {
    vendor: 'anthropic',
    implemented: true,
    defaultModel: 'claude-fable-5',
    fallbacks: ['claude-opus-4-8', 'claude-sonnet-4-6'],
    models: ANTHROPIC_MODELS,
  },
  // Registered but not implemented until #2; model IDs are populated then.
  openai: { vendor: 'openai', implemented: false, defaultModel: '', fallbacks: [], models: {} },
  gemini: { vendor: 'gemini', implemented: false, defaultModel: '', fallbacks: [], models: {} },
  ollama: { vendor: 'ollama', implemented: false, defaultModel: '', fallbacks: [], models: {} },
}

export function isVendorImplemented(vendor: Vendor): boolean {
  return REGISTRY[vendor].implemented
}

export function resolveModel(vendor: Vendor, requested?: string): string {
  const entry = REGISTRY[vendor]
  if (requested && entry.models[requested]) return requested
  return entry.defaultModel
}

export function capabilityOf(vendor: Vendor, model: string): ModelCapability | undefined {
  return REGISTRY[vendor].models[model]
}

/** [resolved selected model, ...registry fallbacks not already first] — consumed by withFallback. */
export function modelChain(vendor: Vendor, selected?: string): string[] {
  const first = resolveModel(vendor, selected)
  return [first, ...REGISTRY[vendor].fallbacks.filter((m) => m !== first)]
}

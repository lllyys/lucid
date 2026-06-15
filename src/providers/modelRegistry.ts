// Purpose: the single source of truth for model IDs + capability metadata and
// ordered fallbacks (rule 65 §2). No model-ID literal lives anywhere else. Each
// provider defaults to its latest capable model; the ordered fallback list is
// what `withFallback` (base.ts) walks so a model degrades without code changes.
//
// Anthropic IDs are per the claude-api skill (latest: claude-fable-5, then
// claude-opus-4-8, claude-sonnet-4-6). OpenAI / Gemini / Ollama are implemented
// (#5 WI-4 wires the factory switch — OpenAI/Ollama via openaiCompatibleStream,
// Gemini via geminiStream) and carry real model IDs (verified mid-2026). They use
// `allowAnyModel` (like `custom`): no fabricated capability figures, the user/
// registry model is sent as-is, and a drifted ID is a zero-code change (rule 65 §2).
// The Settings model picker offers `modelChain(vendor)`.

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
  /** A user-supplied model is accepted as-is (no fixed catalog) — the `custom` provider (#7). */
  allowAnyModel?: boolean
}

// Limits per the claude-api skill catalog (shared/models.md): 1M context window;
// Fable 5 / Opus 4.8 = 128K max output, Sonnet 4.6 = 64K. costTier follows pricing
// (Fable $10/$50 & Opus $5/$25 = high; Sonnet $3/$15 = medium).
const ANTHROPIC_MODELS: Record<string, ModelCapability> = {
  'claude-fable-5': {
    id: 'claude-fable-5',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    streaming: true,
    vision: true,
    costTier: 'high',
  },
  'claude-opus-4-8': {
    id: 'claude-opus-4-8',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    streaming: true,
    vision: true,
    costTier: 'high',
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    contextWindow: 1_000_000,
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
  // #5 WI-1: model DATA populated (real IDs), but implemented:false until WI-4 wires the
  // factory switch. allowAnyModel — no fixed catalog, no fabricated capability figures.
  // OpenAI: OpenAI-compatible chat/completions; gpt-5-pro is Responses-API-only (excluded).
  openai: {
    vendor: 'openai',
    implemented: true,
    defaultModel: 'gpt-5.5',
    fallbacks: ['gpt-5.4-mini', 'gpt-5.4-nano'],
    models: {},
    allowAnyModel: true,
  },
  // Gemini: generateContent (own adapter, WI-2). GA default; the Pro tier is preview-only.
  gemini: {
    vendor: 'gemini',
    implemented: true,
    defaultModel: 'gemini-3.5-flash',
    fallbacks: ['gemini-3.1-flash-lite'],
    models: {},
    allowAnyModel: true,
  },
  // Ollama: OpenAI-compatible at localhost; models are user-installed (no remote catalog).
  ollama: {
    vendor: 'ollama',
    implemented: true,
    defaultModel: 'llama3.2',
    fallbacks: [],
    models: {},
    allowAnyModel: true,
  },
  // Custom / OpenAI-compatible (#7): implemented; the model is user-supplied (no fixed catalog).
  custom: { vendor: 'custom', implemented: true, defaultModel: '', fallbacks: [], models: {}, allowAnyModel: true },
}

export function isVendorImplemented(vendor: Vendor): boolean {
  return REGISTRY[vendor].implemented
}

export function resolveModel(vendor: Vendor, requested?: string): string {
  const entry = REGISTRY[vendor]
  if (entry.allowAnyModel) return requested ?? entry.defaultModel // user-supplied model, no catalog
  if (requested && entry.models[requested]) return requested
  return entry.defaultModel
}

export function capabilityOf(vendor: Vendor, model: string): ModelCapability | undefined {
  return REGISTRY[vendor].models[model]
}

/** [resolved selected model, ...registry fallbacks], de-duplicated, order preserved. */
export function modelChain(vendor: Vendor, selected?: string): string[] {
  const first = resolveModel(vendor, selected)
  return [...new Set([first, ...REGISTRY[vendor].fallbacks])]
}

// Purpose: the wire-format codec for feature #15 — serialize/parse the syncable provider configuration
// (vendor, per-vendor models, custom base URL, the per-vendor API keys, AND the N user-defined custom
// providers WITH their keys) to/from a versioned plaintext JSON string. This plaintext is what
// `configCrypto` encrypts, so it is the ONE place API keys are serialized — they ride only inside the E2E
// ciphertext, never plaintext-on-disk/server (rule 65 §5). UNLIKE providerStore's localStorage partialize
// (which STRIPS every key — a persisted key would violate §5), the encrypted blob is the secure channel
// for keys, so each custom provider's `key` IS carried here (syncing the user's DeepSeek key across
// devices is the whole point of #15). `parseConfig` sanitizes a corrupt/hostile decrypted blob
// (skip-bad-fields, drop prototype-pollution keys, ≤50-entry cap, version-gate) so the controller can
// hydrate providerStore safely. The envelope is v2: a v1 blob (no customProviders) migrates forward to an
// empty custom map (backward-compat — an existing user's encrypted blob still decrypts + parses). No
// client timestamps — conflict ordering is the server `rev` (see the plan, M1).

import { isRecord } from '@/lib/guards'
import type { CustomProvider } from '@/stores/providerStoreMigrate'

const VERSION = 2
/** The oldest envelope version this codec still reads (v1 had no custom providers). */
const MIN_VERSION = 1
/** Upper bound on parsed custom providers — guards a hostile/oversized decrypted blob (mirrors the store). */
const MAX_CUSTOM_PROVIDERS = 50

export type { CustomProvider }

export interface SyncableConfig {
  vendor: string
  models: Record<string, string>
  baseUrl: string
  apiKeys: Record<string, string>
  /** The N user-defined OpenAI-compatible providers (#10), keys INCLUDED — they ride the ciphertext. */
  customProviders: Record<string, CustomProvider>
  /** The custom provider in use when `vendor==='custom'`; null when a built-in is active. */
  activeCustomId: string | null
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Keep only string-valued, non-prototype-polluting entries (defensive against a hostile decrypted blob). */
function stringRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isRecord(v) || Array.isArray(v)) return out // arrays pass isRecord — drop them (not a vendor map)
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string' && !UNSAFE_KEYS.has(k)) out[k] = val
  }
  return out
}

/**
 * Defensively rehydrate the custom-provider map from a decrypted-but-untrusted blob. Own-key iteration
 * (the keys are user/attacker-controlled), skip prototype-pollution keys, require an object whose
 * id/label/baseUrl/model/key are ALL strings and whose id === its key, force testResult to idle (never
 * carried from the blob), drop everything else, cap the count. UNLIKE the store's localStorage rehydrate,
 * the `key` is kept (this blob IS the secure channel for keys — rule 65 §5/§6).
 */
function sanitizeCustomProviders(v: unknown): Record<string, CustomProvider> {
  const out: Record<string, CustomProvider> = {}
  if (!isRecord(v) || Array.isArray(v)) return out
  let count = 0
  for (const [key, raw] of Object.entries(v)) {
    if (count >= MAX_CUSTOM_PROVIDERS) break
    if (UNSAFE_KEYS.has(key)) continue
    if (!isRecord(raw)) continue
    const { id, label, baseUrl, model, key: apiKey } = raw as Record<string, unknown>
    if (typeof id !== 'string' || id !== key) continue
    if (typeof label !== 'string' || typeof baseUrl !== 'string' || typeof model !== 'string') continue
    if (typeof apiKey !== 'string') continue
    out[key] = { id, label, baseUrl, model, key: apiKey, testResult: { status: 'idle' } }
    count++
  }
  return out
}

/** Serialize the config into the versioned plaintext that `encryptConfig` will encrypt. */
export function serializeConfig(c: SyncableConfig): string {
  return JSON.stringify({
    v: VERSION,
    vendor: c.vendor,
    models: c.models,
    baseUrl: c.baseUrl,
    apiKeys: c.apiKeys,
    customProviders: c.customProviders,
    activeCustomId: c.activeCustomId,
  })
}

/** Parse + sanitize a decrypted plaintext. Returns null for unparseable / non-object / unknown-version /
 *  missing-vendor input; otherwise a SyncableConfig with bad fields dropped. A v1 blob (no custom
 *  providers) migrates forward to an empty custom map + null activeCustomId (backward-compat). */
export function parseConfig(plaintext: string): SyncableConfig | null {
  let raw: unknown
  try {
    raw = JSON.parse(plaintext)
  } catch {
    return null
  }
  if (!isRecord(raw) || typeof raw.v !== 'number' || raw.v < MIN_VERSION || raw.v > VERSION) return null
  if (typeof raw.vendor !== 'string') return null
  // v1 had no custom providers — migrate forward to the empty map (a stray v1 customProviders is ignored).
  const customProviders = raw.v >= VERSION ? sanitizeCustomProviders(raw.customProviders) : {}
  const activeCustomId =
    typeof raw.activeCustomId === 'string' && raw.activeCustomId in customProviders ? raw.activeCustomId : null
  return {
    vendor: raw.vendor,
    models: stringRecord(raw.models),
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
    apiKeys: stringRecord(raw.apiKeys),
    customProviders,
    activeCustomId,
  }
}

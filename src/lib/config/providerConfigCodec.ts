// Purpose: the wire-format codec for feature #15 — serialize/parse the syncable provider configuration
// (vendor, per-vendor models, custom base URL, AND the per-vendor API keys) to/from a versioned plaintext
// JSON string. This plaintext is what `configCrypto` encrypts, so it is the ONE place API keys are
// serialized — they ride only inside the E2E ciphertext, never plaintext-on-disk/server (rule 65 §5).
// `parseConfig` sanitizes a corrupt/hostile decrypted blob (skip-bad-fields, drop prototype-pollution
// keys, version-gate) so WI-7 can hydrate providerStore safely. No client timestamps — conflict ordering
// is the server `rev` (see the plan, M1).

import { isRecord } from '@/lib/guards'

const VERSION = 1

export interface SyncableConfig {
  vendor: string
  models: Record<string, string>
  baseUrl: string
  apiKeys: Record<string, string>
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

/** Serialize the config into the versioned plaintext that `encryptConfig` will encrypt. */
export function serializeConfig(c: SyncableConfig): string {
  return JSON.stringify({ v: VERSION, vendor: c.vendor, models: c.models, baseUrl: c.baseUrl, apiKeys: c.apiKeys })
}

/** Parse + sanitize a decrypted plaintext. Returns null for unparseable / non-object / wrong-version /
 *  missing-vendor input; otherwise a SyncableConfig with bad fields dropped. */
export function parseConfig(plaintext: string): SyncableConfig | null {
  let raw: unknown
  try {
    raw = JSON.parse(plaintext)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.v !== VERSION || typeof raw.vendor !== 'string') return null
  return {
    vendor: raw.vendor,
    models: stringRecord(raw.models),
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
    apiKeys: stringRecord(raw.apiKeys),
  }
}

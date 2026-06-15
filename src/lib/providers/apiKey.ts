// Purpose: pure helpers for the provider API-key UI (feature #4, WI-1 — #13). Masking for
// display (never reveals the secret) and shape validation (a cheap client-side prefix/length
// check, NOT authentication — a runtime 401 is the authoritative "invalid key", handled via the
// panel op's `invalidKey` error). No key is ever logged here (rule 65 §5).

import type { Vendor } from '@/providers/types'

// Public, non-secret key prefixes per vendor. A vendor absent here has no shape constraint.
const KEY_PREFIX: Partial<Record<Vendor, string>> = {
  anthropic: 'sk-ant-',
  openai: 'sk-',
  gemini: 'AIza',
}

const MIN_KEY_LENGTH = 12

/**
 * Mask a key for display: a short non-secret prefix hint + the last 4 chars, e.g.
 * `sk-ant-…1234` → `sk-…1234`. A key too short to mask safely is fully dotted. Empty in,
 * empty out. The full secret is NEVER returned.
 */
export function maskKey(key: string): string {
  const k = key.trim()
  if (k === '') return ''
  if (k.length <= 4) return '•'.repeat(k.length)
  return `${k.slice(0, 3)}…${k.slice(-4)}`
}

export interface KeyShapeResult {
  ok: boolean
  /** Flat i18n key (rule 66 §5) describing why the shape is rejected. */
  messageKey?: string
}

/**
 * Cheap client-side shape check before saving: non-empty, expected prefix (if the vendor has
 * one), and a minimum length. This is a typo guard, not auth — a correctly-shaped key can still
 * be rejected at request time (surfaced as the panel's `invalidKey` error).
 */
export function validateKeyShape(vendor: Vendor, key: string): KeyShapeResult {
  const k = key.trim()
  if (k === '') return { ok: false, messageKey: 'settings.keyRequired' }
  const prefix = KEY_PREFIX[vendor]
  if (prefix && !k.startsWith(prefix)) return { ok: false, messageKey: 'settings.keyBadPrefix' }
  if (k.length < MIN_KEY_LENGTH) return { ok: false, messageKey: 'settings.keyTooShort' }
  return { ok: true }
}

// Purpose: the providerStore persist v1→v2 transformer + the open-keyed defensive rehydrate of the
// custom-provider map (#10 WI-1). Split out of providerStore.ts to keep that file under the ~300-line
// ceiling (mirroring safeJSONStorage). v1 had ONE custom slot (a scalar `baseUrl` + `models.custom`);
// v2 holds N named custom providers in a `Record<string, CustomProvider>`. Because the persisted
// customProviders keys are USER/attacker-controlled (unlike the fixed `Vendor` set), the rehydrate
// iterates the blob's OWN keys, skips prototype-pollution keys, type-checks every field, forces
// key/testResult back to their in-memory defaults (a persisted key or `ok` dot would violate rule 65
// §5), drops malformed entries, and caps the count (DoS guard). A dangling activeCustomId → null.

import { isRecord } from '@/lib/guards'
import { randomUuid } from '@/lib/uuid'

/** A single user-defined OpenAI-compatible provider (#10). `key` + `testResult` are in-memory only. */
export interface CustomProvider {
  id: string
  label: string
  baseUrl: string
  model: string
  /** API key, in memory only — NEVER persisted (rule 65 §5). */
  key: string
  /** Transient connection-test outcome — NEVER persisted (a stale `ok` would mislead). */
  testResult: { status: 'idle' | 'testing' | 'ok' | 'fail'; latencyMs?: number; msgKey?: string }
}

/** Upper bound on rehydrated custom providers — guards a hostile/oversized persisted blob. */
export const MAX_CUSTOM_PROVIDERS = 50

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

// Injectable id generator (test seam, mirroring sessionStore's __resetSessionIds). Production always
// mints uuids; tests may install a deterministic counter for stable assertions.
let mintId: () => string = randomUuid
/** Test seam: deterministic ids (c1, c2, …) for stable assertions. */
export function __resetCustomIds(): void {
  let n = 0
  mintId = () => `c${++n}`
}
/** Test seam: restore the production uuid generator. */
export function __useRandomCustomIds(): void {
  mintId = randomUuid
}

/** Trim + case-insensitive label uniqueness (#10 — business logic shared by the form + store actions). */
export function uniqueLabel(
  label: string,
  customProviders: Record<string, CustomProvider>,
  exceptId?: string,
): boolean {
  const norm = label.trim().toLowerCase()
  if (norm === '') return false
  return !Object.values(customProviders).some(
    (c) => c.id !== exceptId && c.label.trim().toLowerCase() === norm,
  )
}

/** Mint a fresh custom provider with in-memory defaults for key/testResult. */
export function makeCustomProvider(fields: { label: string; baseUrl: string; model: string; key?: string }): CustomProvider {
  return {
    id: mintId(),
    label: fields.label,
    baseUrl: fields.baseUrl,
    model: fields.model,
    key: fields.key ?? '',
    testResult: { status: 'idle' },
  }
}

/**
 * Defensive rehydrate of a persisted customProviders map. Own-key iteration (NOT the #12 fixed-VENDORS
 * precedent — these keys are untrusted): skip prototype keys, require an object whose id/label/baseUrl/
 * model are all strings and whose id === its key, force key="" + testResult idle (never from disk),
 * drop everything else, cap the count.
 */
export function sanitizeCustomProviders(persisted: unknown): Record<string, CustomProvider> {
  const out: Record<string, CustomProvider> = {}
  if (!isRecord(persisted) || Array.isArray(persisted)) return out
  let count = 0
  for (const [key, raw] of Object.entries(persisted)) {
    if (count >= MAX_CUSTOM_PROVIDERS) break
    if (PROTO_KEYS.has(key)) continue
    if (!isRecord(raw)) continue
    const { id, label, baseUrl, model } = raw as Record<string, unknown>
    if (typeof id !== 'string' || id !== key) continue
    if (typeof label !== 'string' || typeof baseUrl !== 'string' || typeof model !== 'string') continue
    out[key] = { id, label, baseUrl, model, key: '', testResult: { status: 'idle' } }
    count++
  }
  return out
}

/** A persisted activeCustomId is kept only iff it is a string pointing at an existing entry; else null. */
export function pickActiveCustomId(
  persisted: unknown,
  customProviders: Record<string, CustomProvider>,
): string | null {
  return typeof persisted === 'string' && persisted in customProviders ? persisted : null
}

/**
 * persist `migrate`: transform a v1 single-custom blob into the v2 N-custom shape. v1 partialize was
 * `{vendor, models, baseUrl}`; iff baseUrl is a non-empty string, create ONE custom entry (label
 * 'Custom', model = v1 models.custom ?? ''), and set activeCustomId to it ONLY iff v1 vendor==='custom'.
 * A v2-or-current blob passes through; any unknown version is dropped (→ undefined).
 */
export function migrateProviderV1toV2(persisted: unknown, version: number): unknown {
  if (version === 2) return persisted // current — passthrough
  if (version !== 1) return undefined // unknown — drop, persist rehydrates defaults
  const v1 = isRecord(persisted) ? persisted : {}
  const baseUrl = typeof v1.baseUrl === 'string' ? v1.baseUrl : ''
  const customProviders: Record<string, CustomProvider> = {}
  let activeCustomId: string | null = null
  if (baseUrl !== '') {
    const model = isRecord(v1.models) && typeof v1.models.custom === 'string' ? v1.models.custom : ''
    const entry = makeCustomProvider({ label: 'Custom', baseUrl, model })
    customProviders[entry.id] = entry
    if (v1.vendor === 'custom') activeCustomId = entry.id
  }
  return { ...v1, customProviders, activeCustomId }
}

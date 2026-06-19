// Purpose: client-side cross-device config sync (#15 WI-5). Talks to the same-origin `/config` endpoint:
// `loadAndDecrypt` (GET → decrypt → parse) and `encryptAndSave` (serialize → encrypt → PUT, with a 409
// conflict decrypting the server's authoritative blob). Owns the per-device `syncedRev` (the last rev
// this device incorporated) in a dedicated `lucid.config-rev` record — a SEPARATE key, never a
// providerStore field, so #12's persist/partialize is untouched. Conflict ordering is the server `rev`
// ALONE (no client clock — see the plan, M1). Injectable `fetch` + `storage` + `timeoutMs` for tests.
// Every request is bounded by an AbortController deadline (rule 65 §4 — a hung server fails into the
// error path, never spins). Failures map to localized error KINDS (the UI maps each to an `error.*` key
// — rule 65 §4): `insecureContext` → error.insecureContext, `unreachable` → error.configUnreachable,
// `requestFailed` → error.configRequestFailed, `wrongPassphraseOrCorrupt` → error.wrongPassphraseOrCorrupt
// (the WI-6 design adds the locale strings). The API key rides only inside the E2E ciphertext.

import type { StateStorage } from 'zustand/middleware'
import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'
import { isRecord, isNonNegInt } from '@/lib/guards'
import {
  encryptConfig,
  decryptConfig,
  InsecureContextError,
  type EncryptedBlob,
} from '@/lib/crypto/configCrypto'
import { serializeConfig, parseConfig, type SyncableConfig } from './providerConfigCodec'

const SYNCED_REV_KEY = 'lucid.config-rev'
/** Request deadline: a hung `/config` server fails into the error path rather than spinning (rule 65 §4). */
const DEFAULT_TIMEOUT_MS = 15_000

export type ConfigSyncErrorKind = 'insecureContext' | 'wrongPassphraseOrCorrupt' | 'unreachable' | 'requestFailed'

export type ConfigSyncResult<T> = { ok: true; value: T } | { ok: false; error: ConfigSyncErrorKind }

export type SaveOutcome =
  | { status: 'applied'; rev: number }
  | { status: 'conflict'; config: SyncableConfig; rev: number } // server advanced — re-pulled + decrypted

export interface ConfigSyncOptions {
  /** Prefix for the `/config` URL. Default '' (same-origin). Injected (with a full URL) in tests. */
  baseUrl?: string
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch
  /** Injected for tests; defaults to a localStorage-backed safe storage. */
  storage?: StateStorage
  /** Per-request deadline (ms); default 15s. */
  timeoutMs?: number
}

export interface ConfigSync {
  loadAndDecrypt(passphrase: string): Promise<ConfigSyncResult<{ config: SyncableConfig; rev: number } | null>>
  encryptAndSave(passphrase: string, config: SyncableConfig, baseRev: number): Promise<ConfigSyncResult<SaveOutcome>>
  readSyncedRev(): number
  writeSyncedRev(rev: number): void
}

/** HTTP status → error kind (mirrors the sync backend): 5xx unreachable, other non-OK requestFailed. */
function statusToError(status: number): ConfigSyncErrorKind {
  return status >= 500 ? 'unreachable' : 'requestFailed'
}

/** A decrypt/encrypt failure → an error kind. Insecure context is distinct; everything else (a wrong
 *  passphrase, a tampered/corrupt blob, or an unsupported version) is "can't decrypt this". */
function cryptoError(e: unknown): ConfigSyncErrorKind {
  return e instanceof InsecureContextError ? 'insecureContext' : 'wrongPassphraseOrCorrupt'
}

/** Parse text as JSON, or undefined when it isn't valid JSON (a malformed body → requestFailed upstream). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function createConfigSync(opts: ConfigSyncOptions = {}): ConfigSync {
  const doFetch = opts.fetch ?? fetch
  const storage = opts.storage ?? createSafeJSONStorage()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const url = `${opts.baseUrl ?? ''}/config`

  type Fetched = { kind: 'net' } | { kind: 'res'; status: number; body: unknown }

  /** One bounded round-trip: the AbortController deadline spans BOTH the fetch and the body read (a
   *  server that sends headers then hangs the body is still bounded), then the timer is always cleared.
   *  Any network error or timeout abort → `{kind:'net'}` (the caller maps it to `unreachable`). */
  async function send(init: RequestInit): Promise<Fetched> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await doFetch(url, { ...init, signal: controller.signal })
      const body = parseJson(await res.text())
      return { kind: 'res', status: res.status, body }
    } catch {
      return { kind: 'net' }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Decrypt a server blob → a validated SyncableConfig (shared by the load + 409-conflict paths). */
  async function decryptToConfig(passphrase: string, blob: EncryptedBlob): Promise<ConfigSyncResult<SyncableConfig>> {
    let plaintext: string
    try {
      plaintext = await decryptConfig(passphrase, blob)
    } catch (e) {
      return { ok: false, error: cryptoError(e) }
    }
    const config = parseConfig(plaintext)
    if (config === null) return { ok: false, error: 'wrongPassphraseOrCorrupt' }
    return { ok: true, value: config }
  }

  async function loadAndDecrypt(
    passphrase: string,
  ): Promise<ConfigSyncResult<{ config: SyncableConfig; rev: number } | null>> {
    const r = await send({ method: 'GET' })
    if (r.kind === 'net') return { ok: false, error: 'unreachable' }
    if (r.status < 200 || r.status >= 300) return { ok: false, error: statusToError(r.status) }
    const body = r.body
    if (!isRecord(body)) return { ok: false, error: 'requestFailed' }
    if (body.blob === null || body.blob === undefined) return { ok: true, value: null } // no config stored yet
    if (!isRecord(body.blob) || !isNonNegInt(body.rev)) return { ok: false, error: 'requestFailed' }
    const dec = await decryptToConfig(passphrase, body.blob as unknown as EncryptedBlob)
    if (!dec.ok) return dec
    return { ok: true, value: { config: dec.value, rev: body.rev } }
  }

  async function encryptAndSave(
    passphrase: string,
    config: SyncableConfig,
    baseRev: number,
  ): Promise<ConfigSyncResult<SaveOutcome>> {
    let blob: EncryptedBlob
    try {
      blob = await encryptConfig(passphrase, serializeConfig(config))
    } catch (e) {
      return { ok: false, error: cryptoError(e) }
    }
    const r = await send({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob, baseRev }),
    })
    if (r.kind === 'net') return { ok: false, error: 'unreachable' }
    if (r.status === 409) {
      const body = r.body
      if (!isRecord(body) || !isRecord(body.blob) || !isNonNegInt(body.rev)) {
        return { ok: false, error: 'requestFailed' }
      }
      const dec = await decryptToConfig(passphrase, body.blob as unknown as EncryptedBlob)
      if (!dec.ok) return dec
      return { ok: true, value: { status: 'conflict', config: dec.value, rev: body.rev } }
    }
    if (r.status < 200 || r.status >= 300) return { ok: false, error: statusToError(r.status) }
    if (!isRecord(r.body) || !isNonNegInt(r.body.rev)) return { ok: false, error: 'requestFailed' }
    return { ok: true, value: { status: 'applied', rev: r.body.rev } }
  }

  /** The last rev this device incorporated (0 if never synced / absent / corrupt). */
  function readSyncedRev(): number {
    const stored = storage.getItem(SYNCED_REV_KEY)
    if (typeof stored !== 'string') return 0
    const v = parseJson(stored)
    return isNonNegInt(v) ? v : 0
  }

  function writeSyncedRev(rev: number): void {
    storage.setItem(SYNCED_REV_KEY, JSON.stringify(rev))
  }

  return { loadAndDecrypt, encryptAndSave, readSyncedRev, writeSyncedRev }
}

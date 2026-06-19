// Purpose: end-to-end encryption of the provider config + API keys (feature #15). The browser derives an
// AES-256-GCM key from the user's passphrase (PBKDF2-SHA256, 600k iterations — OWASP 2026 / Bitwarden) and
// encrypts client-side; only the ciphertext is stored on the self-hosted server, which never sees the key
// or the passphrase. Native Web Crypto only (no deps). The derived key is non-extractable + memory-only;
// the passphrase/key are never persisted or logged (rule 65 §5).
//
// REQUIRES a secure context: `crypto.subtle` is `undefined` on a plain-`http://` non-localhost origin, so
// E2E mandates HTTPS — guarded with `InsecureContextError` (mirrors `src/lib/uuid.ts`'s handling of the
// same secure-context gate on `crypto.randomUUID`). The ENTIRE header (v/kdf/iterations/salt/iv) is bound
// into the GCM AAD, so tampering with any KDF parameter — including a version/algorithm downgrade — breaks
// decryption.

const VERSION = 1
const KDF = 'PBKDF2-SHA256'
const ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12

export interface EncryptedBlob {
  v: number
  kdf: string
  iterations: number
  salt: string // base64
  iv: string // base64
  ciphertext: string // base64 — AES-GCM ciphertext including the 128-bit auth tag
}

/** Thrown when `crypto.subtle` is unavailable — i.e. a non-secure context (plain `http://`). HTTPS-only. */
export class InsecureContextError extends Error {
  constructor() {
    super('Web Crypto (crypto.subtle) is unavailable — an HTTPS (secure) context is required.')
    this.name = 'InsecureContextError'
  }
}

/** Thrown when the GCM auth tag fails to verify — a wrong passphrase OR a corrupt/tampered blob. */
export class WrongPassphraseError extends Error {
  constructor() {
    super('Could not decrypt: wrong passphrase or corrupted config.')
    this.name = 'WrongPassphraseError'
  }
}

/** `crypto.subtle` presence IS the secure-context signal for Web Crypto (same approach as uuid.ts). */
function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle
  if (!s) throw new InsecureContextError()
  return s
}

const te = new TextEncoder()
const td = new TextDecoder()
// `TextEncoder.encode` yields `Uint8Array<ArrayBufferLike>`, which WebCrypto's `BufferSource` (it wants an
// `ArrayBuffer`-backed view) rejects under strict TS; copy into an ArrayBuffer-backed array.
const encodeUtf8 = (s: string) => Uint8Array.from(te.encode(s))

// Byte-accurate base64 — NOT UTF-8-aware (a UTF-8 round-trip silently corrupts binary bytes > 0x7F).
function toB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Canonical, deterministic AAD over the ENTIRE header. Built identically on encrypt + decrypt (fixed
 * field order; salt/iv as their stored base64). Binding v + kdf (not just the KDF params) closes the
 * version/algorithm-downgrade vector — any header edit invalidates the GCM tag.
 */
function headerAAD(h: Pick<EncryptedBlob, 'v' | 'kdf' | 'iterations' | 'salt' | 'iv'>) {
  return encodeUtf8(`lucid-config/v=${h.v};kdf=${h.kdf};it=${h.iterations};salt=${h.salt};iv=${h.iv}`)
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encodeUtf8(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: the key never leaves memory, can't be serialized out
    ['encrypt', 'decrypt'],
  )
}

/** Encrypt `plaintext` under `passphrase` → a self-describing, versioned, AAD-authenticated blob. */
export async function encryptConfig(passphrase: string, plaintext: string): Promise<EncryptedBlob> {
  subtle() // secure-context guard first — throws InsecureContextError on a plain-http origin
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES)) // fresh per encryption (never reused)
  const header = { v: VERSION, kdf: KDF, iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv) }
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: headerAAD(header) },
    key,
    encodeUtf8(plaintext),
  )
  return { ...header, ciphertext: toB64(new Uint8Array(ct)) }
}

/** Decrypt a blob. Throws InsecureContextError (no subtle) or WrongPassphraseError (tag fails). */
export async function decryptConfig(passphrase: string, blob: EncryptedBlob): Promise<string> {
  subtle() // secure-context guard first
  if (blob.v !== VERSION || blob.kdf !== KDF) {
    throw new Error(`Unsupported crypto blob (v=${blob.v}, kdf=${blob.kdf}).`)
  }
  const key = await deriveKey(passphrase, fromB64(blob.salt), blob.iterations)
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromB64(blob.iv), additionalData: headerAAD(blob) },
      key,
      fromB64(blob.ciphertext),
    )
    return td.decode(pt)
  } catch {
    throw new WrongPassphraseError() // GCM tag mismatch: wrong passphrase or a tampered/corrupt blob
  }
}

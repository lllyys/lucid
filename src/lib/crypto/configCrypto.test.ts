import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  encryptConfig,
  decryptConfig,
  InsecureContextError,
  WrongPassphraseError,
  type EncryptedBlob,
} from './configCrypto'

const PASS = 'correct horse battery staple'
const PLAIN = JSON.stringify({ vendor: 'custom', apiKeys: { custom: 'sk-secret-DONOTLEAK' } })
// flip the first base64 char → valid base64, different decoded bytes (tamper sim)
const bumpB64 = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1)

afterEach(() => vi.unstubAllGlobals())

describe('configCrypto', () => {
  it('round-trips: decrypt(encrypt(x)) === x', async () => {
    const blob = await encryptConfig(PASS, PLAIN)
    expect(await decryptConfig(PASS, blob)).toBe(PLAIN)
  })

  it('produces a well-formed versioned blob that does NOT contain the plaintext secret', async () => {
    const blob = await encryptConfig(PASS, PLAIN)
    expect(blob).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iterations: 600000 })
    expect(typeof blob.salt).toBe('string')
    expect(typeof blob.iv).toBe('string')
    expect(blob.ciphertext.length).toBeGreaterThan(0)
    expect(JSON.stringify(blob)).not.toContain('sk-secret-DONOTLEAK') // it's encrypted
  })

  it('uses a fresh salt + iv per encryption (same input → different blobs)', async () => {
    const a = await encryptConfig(PASS, PLAIN)
    const b = await encryptConfig(PASS, PLAIN)
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('throws WrongPassphraseError on a wrong passphrase', async () => {
    const blob = await encryptConfig(PASS, PLAIN)
    await expect(decryptConfig('wrong passphrase', blob)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('throws on an unsupported crypto version (version-branch)', async () => {
    const blob = await encryptConfig(PASS, PLAIN)
    await expect(decryptConfig(PASS, { ...blob, v: 99 })).rejects.toThrow()
  })

  // Every header field is rejected on tamper. `v`/`kdf` are caught earlier by the version-branch (a
  // defense-in-depth check ahead of the AAD); `iterations`/`salt`/`iv` tamper reaches + trips the AAD.
  it.each(['iterations', 'kdf', 'v', 'salt', 'iv'] as const)(
    'rejects a tampered header field (version-branch for v/kdf, AAD for iterations/salt/iv): %s',
    async (field) => {
      const blob = await encryptConfig(PASS, PLAIN)
      const t: EncryptedBlob = { ...blob }
      if (field === 'iterations') t.iterations = 1000
      else if (field === 'kdf') t.kdf = 'PBKDF2-EVIL'
      else if (field === 'v') t.v = 2
      else if (field === 'salt') t.salt = bumpB64(blob.salt)
      else t.iv = bumpB64(blob.iv)
      await expect(decryptConfig(PASS, t)).rejects.toThrow()
    },
  )

  it('is byte-accurate over all 0–255 byte values + non-ASCII/CJK/emoji', async () => {
    const allBytes = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)).join('') + '中文🔒'
    const blob = await encryptConfig(PASS, allBytes)
    expect(await decryptConfig(PASS, blob)).toBe(allBytes)
  })

  it('handles empty and large plaintext', async () => {
    expect(await decryptConfig(PASS, await encryptConfig(PASS, ''))).toBe('')
    const large = 'x'.repeat(100_000)
    expect(await decryptConfig(PASS, await encryptConfig(PASS, large))).toBe(large)
  })

  it('throws InsecureContextError when crypto.subtle is unavailable (plain-HTTP origin)', async () => {
    // simulate an insecure context: crypto exists (getRandomValues works) but subtle is undefined
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    await expect(encryptConfig(PASS, PLAIN)).rejects.toBeInstanceOf(InsecureContextError)
    const blob: EncryptedBlob = { v: 1, kdf: 'PBKDF2-SHA256', iterations: 600000, salt: 'AA', iv: 'AA', ciphertext: 'AA' }
    await expect(decryptConfig(PASS, blob)).rejects.toBeInstanceOf(InsecureContextError)
  })
})

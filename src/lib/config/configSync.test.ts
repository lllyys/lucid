import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { createConfigSync } from './configSync'
import { encryptConfig, type EncryptedBlob } from '@/lib/crypto/configCrypto'
import { serializeConfig, type SyncableConfig } from './providerConfigCodec'

const PASS = 'unlock me please'
const CONFIG: SyncableConfig = {
  vendor: 'custom',
  models: { custom: 'gpt-4o-mini' },
  baseUrl: 'https://api.example.com/v1',
  apiKeys: { custom: 'sk-secret-DONOTLEAK' },
}

const okJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const raw = (text: string, status = 200) => new Response(text, { status })
const sync = (fetchImpl: unknown, storage?: StateStorage) =>
  createConfigSync({ fetch: fetchImpl as typeof fetch, storage })

function memStorage(): StateStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) }
}

let blob: EncryptedBlob
beforeAll(async () => {
  blob = await encryptConfig(PASS, serializeConfig(CONFIG))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('configSync — loadAndDecrypt', () => {
  it('GET → decrypt → parse → {config, rev}', async () => {
    const f = vi.fn().mockResolvedValue(okJson({ blob, rev: 3 }))
    expect(await sync(f).loadAndDecrypt(PASS)).toEqual({ ok: true, value: { config: CONFIG, rev: 3 } })
    expect(f).toHaveBeenCalledWith('/config', expect.objectContaining({ method: 'GET' }))
  })

  it('returns null when no config is stored yet (blob: null)', async () => {
    expect(await sync(vi.fn().mockResolvedValue(okJson({ blob: null, rev: 0 }))).loadAndDecrypt(PASS)).toEqual({
      ok: true,
      value: null,
    })
  })

  it('wrong passphrase → wrongPassphraseOrCorrupt', async () => {
    expect(await sync(vi.fn().mockResolvedValue(okJson({ blob, rev: 1 }))).loadAndDecrypt('WRONG')).toEqual({
      ok: false,
      error: 'wrongPassphraseOrCorrupt',
    })
  })

  it('a decryptable-but-non-config plaintext (parse null) → wrongPassphraseOrCorrupt', async () => {
    const junk = await encryptConfig(PASS, 'not valid config json{')
    expect(await sync(vi.fn().mockResolvedValue(okJson({ blob: junk, rev: 1 }))).loadAndDecrypt(PASS)).toEqual({
      ok: false,
      error: 'wrongPassphraseOrCorrupt',
    })
  })

  it('network failure → unreachable; 5xx → unreachable; other 4xx → requestFailed', async () => {
    expect(await sync(vi.fn().mockRejectedValue(new Error('net'))).loadAndDecrypt(PASS)).toEqual({ ok: false, error: 'unreachable' })
    expect(await sync(vi.fn().mockResolvedValue(raw('', 500))).loadAndDecrypt(PASS)).toEqual({ ok: false, error: 'unreachable' })
    expect(await sync(vi.fn().mockResolvedValue(raw('', 400))).loadAndDecrypt(PASS)).toEqual({ ok: false, error: 'requestFailed' })
  })

  it.each([
    ['non-JSON body', raw('not json', 200)],
    ['a JSON non-object', okJson('a string')],
    ['a non-object blob', okJson({ blob: 'nope', rev: 1 })],
    ['a non-number rev', okJson({ blob: { v: 1 }, rev: 'nope' })], // literal blob — it.each is built before beforeAll
  ])('malformed response (%s) → requestFailed', async (_l, res) => {
    expect(await sync(vi.fn().mockResolvedValue(res)).loadAndDecrypt(PASS)).toEqual({ ok: false, error: 'requestFailed' })
  })

  it('insecure context (no crypto.subtle) → insecureContext', async () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    expect(await sync(vi.fn().mockResolvedValue(okJson({ blob, rev: 1 }))).loadAndDecrypt(PASS)).toEqual({
      ok: false,
      error: 'insecureContext',
    })
  })

  it('honors the baseUrl prefix', async () => {
    const f = vi.fn().mockResolvedValue(okJson({ blob: null, rev: 0 }))
    await createConfigSync({ fetch: f as typeof fetch, baseUrl: 'http://host:8787' }).loadAndDecrypt(PASS)
    expect(f).toHaveBeenCalledWith('http://host:8787/config', expect.objectContaining({ method: 'GET' }))
  })

  it('aborts a hung request after timeoutMs → unreachable (rule 65 §4)', async () => {
    vi.useFakeTimers()
    const f = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        }),
    )
    const p = createConfigSync({ fetch: f as unknown as typeof fetch, timeoutMs: 1000 }).loadAndDecrypt(PASS)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await p).toEqual({ ok: false, error: 'unreachable' })
  })

  it('falls back to the global fetch when none is injected', async () => {
    const f = vi.fn().mockResolvedValue(okJson({ blob: null, rev: 0 }))
    vi.stubGlobal('fetch', f)
    expect(await createConfigSync().loadAndDecrypt(PASS)).toEqual({ ok: true, value: null })
    expect(f).toHaveBeenCalledWith('/config', expect.objectContaining({ method: 'GET' }))
  })
})

describe('configSync — encryptAndSave', () => {
  it('serialize → encrypt → PUT {blob, baseRev} → applied; the key is encrypted (not in the body)', async () => {
    const f = vi.fn().mockResolvedValue(okJson({ status: 'applied', rev: 5 }))
    expect(await sync(f).encryptAndSave(PASS, CONFIG, 4)).toEqual({ ok: true, value: { status: 'applied', rev: 5 } })
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PUT')
    const sent = JSON.parse(init.body as string)
    expect(sent.baseRev).toBe(4)
    expect(sent.blob).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256' })
    expect(init.body).not.toContain('sk-secret-DONOTLEAK')
  })

  it('409 → re-pull + decrypt the authoritative blob → conflict {config, rev}', async () => {
    const f = vi.fn().mockResolvedValue(okJson({ status: 'conflict', rev: 9, blob }, 409))
    expect(await sync(f).encryptAndSave(PASS, CONFIG, 1)).toEqual({
      ok: true,
      value: { status: 'conflict', config: CONFIG, rev: 9 },
    })
  })

  it('409 with a malformed / non-JSON body → requestFailed', async () => {
    expect(await sync(vi.fn().mockResolvedValue(okJson({ status: 'conflict' }, 409))).encryptAndSave(PASS, CONFIG, 1)).toEqual({ ok: false, error: 'requestFailed' })
    expect(await sync(vi.fn().mockResolvedValue(raw('x', 409))).encryptAndSave(PASS, CONFIG, 1)).toEqual({ ok: false, error: 'requestFailed' })
  })

  it('409 whose blob was encrypted under a different passphrase → wrongPassphraseOrCorrupt', async () => {
    const other = await encryptConfig('a-different-pass', serializeConfig(CONFIG))
    expect(await sync(vi.fn().mockResolvedValue(okJson({ status: 'conflict', rev: 9, blob: other }, 409))).encryptAndSave(PASS, CONFIG, 1)).toEqual({ ok: false, error: 'wrongPassphraseOrCorrupt' })
  })

  it('network failure → unreachable; 5xx → unreachable; other 4xx → requestFailed', async () => {
    expect(await sync(vi.fn().mockRejectedValue(new Error('net'))).encryptAndSave(PASS, CONFIG, 0)).toEqual({ ok: false, error: 'unreachable' })
    expect(await sync(vi.fn().mockResolvedValue(raw('', 503))).encryptAndSave(PASS, CONFIG, 0)).toEqual({ ok: false, error: 'unreachable' })
    expect(await sync(vi.fn().mockResolvedValue(raw('', 413))).encryptAndSave(PASS, CONFIG, 0)).toEqual({ ok: false, error: 'requestFailed' })
  })

  it('200 with a malformed / non-JSON body → requestFailed', async () => {
    expect(await sync(vi.fn().mockResolvedValue(okJson({ noRev: true }))).encryptAndSave(PASS, CONFIG, 0)).toEqual({ ok: false, error: 'requestFailed' })
    expect(await sync(vi.fn().mockResolvedValue(raw('x', 200))).encryptAndSave(PASS, CONFIG, 0)).toEqual({ ok: false, error: 'requestFailed' })
  })

  it('insecure context → insecureContext BEFORE any network call', async () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    const f = vi.fn()
    expect(await sync(f).encryptAndSave(PASS, CONFIG, 0)).toEqual({ ok: false, error: 'insecureContext' })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('configSync — syncedRev (per-device, lucid.config-rev)', () => {
  it('0 when absent; persists + reads back a written rev', () => {
    const storage = memStorage()
    const cs = sync(vi.fn(), storage)
    expect(cs.readSyncedRev()).toBe(0)
    cs.writeSyncedRev(7)
    expect(storage.map.get('lucid.config-rev')).toBe('7')
    expect(cs.readSyncedRev()).toBe(7)
  })

  it.each([
    ['a non-number', '"abc"'],
    ['a negative number', '-3'],
    ['unparseable JSON', 'not-json'],
  ])('reads 0 for %s', (_l, stored) => {
    const storage = memStorage()
    storage.map.set('lucid.config-rev', stored)
    expect(sync(vi.fn(), storage).readSyncedRev()).toBe(0)
  })
})

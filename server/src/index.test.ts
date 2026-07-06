// WI-8d / #19 WI-1 — the serve entry's pure config parser (createServerConfig) + the token-free stat
// gate (assertTokenFreeDirReadable). Only the env→config mapping AND the injectable stat probe are
// unit-tested here; the listen/serve glue in main() is integration glue (a real socket bind) and is
// intentionally NOT unit-tested. Assertions target observable behavior: a token is REQUIRED unless a
// STATIC_DIR authorizes the token-free single-origin mode (#19), PORT/MAX_BODY_BYTES parse strictly,
// the durable DB-path default is a real file (never ':memory:'), and the token-free start fails fast
// when STATIC_DIR does not stat to a readable directory.

import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createServerConfig,
  assertTokenFreeDirReadable,
  isTokenFree,
  TOKEN_FREE_WARNING,
  DEFAULT_DB_PATH,
  DEFAULT_PORT,
  DEFAULT_MAX_BODY_BYTES,
  type ServerConfig,
} from './index.js'

describe('createServerConfig — SYNC_TOKEN (required UNLESS token-free single-origin, #19 WI-1)', () => {
  it('throws when SYNC_TOKEN is absent AND no STATIC_DIR (a tokenless API-only server is an auth hole)', () => {
    expect(() => createServerConfig({})).toThrow(/SYNC_TOKEN/)
  })

  it('throws when SYNC_TOKEN is the empty string AND no STATIC_DIR', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: '' })).toThrow(/SYNC_TOKEN/)
  })

  it('throws when SYNC_TOKEN is whitespace-only AND no STATIC_DIR', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: '   ' })).toThrow(/SYNC_TOKEN/)
  })

  it('accepts a non-empty token and preserves it verbatim (no trim of the value itself)', () => {
    const cfg = createServerConfig({ SYNC_TOKEN: '  super-secret  ' })
    // The presence check trims, but the token used for auth keeps surrounding spaces if the user set them.
    expect(cfg.token).toBe('  super-secret  ')
  })

  // #19 WI-1: the no-token start is PERMITTED when a STATIC_DIR is set (single-origin token-free
  // intent). createServerConfig stays PURE — it does NOT stat the dir here; that probe is main()'s job
  // via assertTokenFreeDirReadable. The token resolves to '' so createApp enters token-free mode.
  it('permits an ABSENT SYNC_TOKEN when STATIC_DIR is set → token is "" (token-free single-origin)', () => {
    const cfg = createServerConfig({ STATIC_DIR: '/app/web' })
    expect(cfg.token).toBe('')
    expect(cfg.staticDir).toBe('/app/web')
  })

  it('permits an EMPTY SYNC_TOKEN when STATIC_DIR is set → token is "" (token-free single-origin)', () => {
    expect(createServerConfig({ SYNC_TOKEN: '', STATIC_DIR: '/app/web' }).token).toBe('')
  })

  it('permits a WHITESPACE-only SYNC_TOKEN when STATIC_DIR is set → token is "" (collapses to empty)', () => {
    expect(createServerConfig({ SYNC_TOKEN: '   ', STATIC_DIR: '/app/web' }).token).toBe('')
  })

  it('does NOT stat STATIC_DIR inside createServerConfig (stays pure even for a bogus dir)', () => {
    // A nonexistent dir must NOT make the pure parser throw — the stat gate lives in main().
    expect(() => createServerConfig({ STATIC_DIR: '/no/such/dir/at/all' })).not.toThrow()
  })
})

// #19 WI-1 — the stat gate that authorizes the token-free single-origin start. Injectable statSync-like
// probe keeps createServerConfig pure; main() passes the real fs.statSync. The gate runs ONLY when the
// config is token-free (empty token + staticDir); every other quadrant is a no-op.
describe('assertTokenFreeDirReadable — token-free start requires a real readable STATIC_DIR', () => {
  const base: ServerConfig = {
    token: '',
    dbPath: DEFAULT_DB_PATH,
    port: DEFAULT_PORT,
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
    allowedUpstreams: [],
  }

  it('passes when the token-free STATIC_DIR stats to a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lucid-statgate-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html>')
    expect(() => assertTokenFreeDirReadable({ ...base, staticDir: dir })).not.toThrow()
  })

  it('FAILS FAST when the token-free STATIC_DIR is missing (a typo must NOT open an unauthed /sync)', () => {
    expect(() => assertTokenFreeDirReadable({ ...base, staticDir: '/no/such/dir' })).toThrow(/STATIC_DIR/)
  })

  it('FAILS FAST when STATIC_DIR points at a FILE, not a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lucid-statgate-'))
    const file = join(dir, 'not-a-dir.txt')
    writeFileSync(file, 'x')
    expect(() => assertTokenFreeDirReadable({ ...base, staticDir: file })).toThrow(/STATIC_DIR/)
  })

  it('is a NO-OP for a token-authed config (a token server never stats the dir)', () => {
    // staticDir set but token present → NOT token-free → the gate does nothing, even for a bad dir.
    const statProbe = vi.fn()
    assertTokenFreeDirReadable({ ...base, token: 'real-tok', staticDir: '/no/such/dir' }, statProbe)
    expect(statProbe).not.toHaveBeenCalled()
  })

  it('is a NO-OP for an API-only config (no staticDir → never token-free)', () => {
    const statProbe = vi.fn()
    assertTokenFreeDirReadable({ ...base, token: 'real-tok' }, statProbe)
    expect(statProbe).not.toHaveBeenCalled()
  })

  it('treats a probe that throws (ENOENT) as a missing dir → fail fast', () => {
    const statProbe = vi.fn(() => {
      throw new Error('ENOENT')
    })
    expect(() => assertTokenFreeDirReadable({ ...base, staticDir: '/x' }, statProbe)).toThrow(/STATIC_DIR/)
  })
})

// #19 WI-1 — the token-free predicate + the LOUD startup warning (the content is load-bearing, not
// cosmetic, so it's pinned). main() logs TOKEN_FREE_WARNING via console.warn when isTokenFree is true.
describe('isTokenFree + TOKEN_FREE_WARNING (#19 WI-1)', () => {
  const base: ServerConfig = {
    token: '',
    dbPath: DEFAULT_DB_PATH,
    port: DEFAULT_PORT,
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
    allowedUpstreams: [],
  }

  it.each([
    { desc: 'staticDir + empty token', cfg: { staticDir: '/app/web', token: '' }, expected: true },
    { desc: 'staticDir + whitespace token', cfg: { staticDir: '/app/web', token: '   ' }, expected: true },
    { desc: 'staticDir + real token (quadrant 2)', cfg: { staticDir: '/app/web', token: 'tok' }, expected: false },
    { desc: 'no staticDir + real token (api-only)', cfg: { token: 'tok' }, expected: false },
  ])('isTokenFree is $expected for $desc', ({ cfg, expected }) => {
    expect(isTokenFree({ ...base, ...cfg })).toBe(expected)
  })

  it('the warning names the consequence (UNAUTHENTICATED + Tailscale ACL + plaintext)', () => {
    expect(TOKEN_FREE_WARNING).toContain('TOKEN-FREE')
    expect(TOKEN_FREE_WARNING).toContain('UNAUTHENTICATED')
    expect(TOKEN_FREE_WARNING).toContain('Tailscale ACL')
    expect(TOKEN_FREE_WARNING).toContain('Plaintext')
  })
})

describe('createServerConfig — PROXY_ALLOWED_UPSTREAMS (#28)', () => {
  it('defaults to [] when unset (the same-origin LLM proxy is disabled)', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok' }).allowedUpstreams).toEqual([])
  })

  it('defaults to [] when blank/whitespace', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok', PROXY_ALLOWED_UPSTREAMS: '   ' }).allowedUpstreams).toEqual([])
  })

  it('parses + normalizes a comma-separated allow-list', () => {
    const cfg = createServerConfig({
      SYNC_TOKEN: 'tok',
      PROXY_ALLOWED_UPSTREAMS: 'http://100.80.151.31:8000/v1, http://localhost:11434/v1/',
    })
    expect(cfg.allowedUpstreams).toEqual(['http://100.80.151.31:8000/v1', 'http://localhost:11434/v1'])
  })

  it('drops invalid entries (non-http scheme, junk)', () => {
    expect(
      createServerConfig({ SYNC_TOKEN: 'tok', PROXY_ALLOWED_UPSTREAMS: 'http://ok/v1, ftp://bad/v1, junk' })
        .allowedUpstreams,
    ).toEqual(['http://ok/v1'])
  })

  it('works in the token-free single-origin quadrant (STATIC_DIR + no token)', () => {
    const cfg = createServerConfig({ STATIC_DIR: '/app/web', PROXY_ALLOWED_UPSTREAMS: 'http://x:8000/v1' })
    expect(cfg.allowedUpstreams).toEqual(['http://x:8000/v1'])
    expect(cfg.token).toBe('')
  })
})

describe('createServerConfig — defaults', () => {
  it('returns the documented defaults when only SYNC_TOKEN is set', () => {
    const cfg = createServerConfig({ SYNC_TOKEN: 'tok' })
    expect(cfg).toEqual({
      token: 'tok',
      dbPath: DEFAULT_DB_PATH,
      port: DEFAULT_PORT,
      maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
      allowedUpstreams: [],
    })
  })

  it('the default DB path is a durable file, never the in-memory store', () => {
    const cfg = createServerConfig({ SYNC_TOKEN: 'tok' })
    expect(cfg.dbPath).toBe('sync.db')
    expect(cfg.dbPath).not.toBe(':memory:')
  })
})

describe('createServerConfig — DB_PATH', () => {
  it('uses an explicit DB_PATH when provided', () => {
    const cfg = createServerConfig({ SYNC_TOKEN: 'tok', DB_PATH: '/data/lucid.db' })
    expect(cfg.dbPath).toBe('/data/lucid.db')
  })

  it('falls back to the default when DB_PATH is empty/whitespace', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok', DB_PATH: '' }).dbPath).toBe(DEFAULT_DB_PATH)
    expect(createServerConfig({ SYNC_TOKEN: 'tok', DB_PATH: '   ' }).dbPath).toBe(DEFAULT_DB_PATH)
  })
})

describe('createServerConfig — PORT', () => {
  it('parses a valid port string', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok', PORT: '3000' }).port).toBe(3000)
  })

  it('accepts the boundary ports 1 and 65535', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok', PORT: '1' }).port).toBe(1)
    expect(createServerConfig({ SYNC_TOKEN: 'tok', PORT: '65535' }).port).toBe(65535)
  })

  it('throws on a non-numeric PORT (abc)', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', PORT: 'abc' })).toThrow(/PORT/)
  })

  it('throws on PORT=0 (out of the 1–65535 range)', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', PORT: '0' })).toThrow(/PORT/)
  })

  it('throws on PORT above the valid range (99999)', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', PORT: '99999' })).toThrow(/PORT/)
  })

  it('throws on a fractional PORT (3000.5)', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', PORT: '3000.5' })).toThrow(/PORT/)
  })

  it('throws on a negative PORT (-1)', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', PORT: '-1' })).toThrow(/PORT/)
  })

  it('falls back to the default when PORT is empty/whitespace', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok', PORT: '' }).port).toBe(DEFAULT_PORT)
    expect(createServerConfig({ SYNC_TOKEN: 'tok', PORT: '   ' }).port).toBe(DEFAULT_PORT)
  })
})

describe('createServerConfig — MAX_BODY_BYTES', () => {
  it('parses a valid positive integer', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok', MAX_BODY_BYTES: '1048576' }).maxBodyBytes).toBe(1048576)
  })

  it('throws on a non-numeric MAX_BODY_BYTES', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', MAX_BODY_BYTES: 'big' })).toThrow(/MAX_BODY_BYTES/)
  })

  it('throws on MAX_BODY_BYTES=0 (must be a positive cap)', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', MAX_BODY_BYTES: '0' })).toThrow(/MAX_BODY_BYTES/)
  })

  it('throws on a negative MAX_BODY_BYTES', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', MAX_BODY_BYTES: '-5' })).toThrow(/MAX_BODY_BYTES/)
  })

  it('throws on a fractional MAX_BODY_BYTES', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: 'tok', MAX_BODY_BYTES: '1.5' })).toThrow(/MAX_BODY_BYTES/)
  })

  it('falls back to the default when MAX_BODY_BYTES is empty/whitespace', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok', MAX_BODY_BYTES: '' }).maxBodyBytes).toBe(
      DEFAULT_MAX_BODY_BYTES,
    )
    expect(createServerConfig({ SYNC_TOKEN: 'tok', MAX_BODY_BYTES: '   ' }).maxBodyBytes).toBe(
      DEFAULT_MAX_BODY_BYTES,
    )
  })
})

describe('createServerConfig — STATIC_DIR (#15 WI-4)', () => {
  it('passes through an explicit STATIC_DIR (single-origin app serving)', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok', STATIC_DIR: '/app/web' }).staticDir).toBe('/app/web')
  })

  it('leaves staticDir undefined when unset/blank (API-only, backward compat)', () => {
    expect(createServerConfig({ SYNC_TOKEN: 'tok' }).staticDir).toBeUndefined()
    expect(createServerConfig({ SYNC_TOKEN: 'tok', STATIC_DIR: '   ' }).staticDir).toBeUndefined()
  })
})

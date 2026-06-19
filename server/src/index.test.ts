// WI-8d — the serve entry's pure config parser (createServerConfig).
// Only the env→config mapping is unit-tested here; the listen/serve glue in main() is integration
// glue (a real socket bind) and is intentionally NOT unit-tested. Assertions target observable
// behavior: a token is REQUIRED (no default — a tokenless server is an auth hole), PORT/MAX_BODY_BYTES
// parse strictly, and the durable DB-path default is a real file (never ':memory:', which loses data).

import { describe, expect, it } from 'vitest'
import { createServerConfig, DEFAULT_DB_PATH, DEFAULT_PORT, DEFAULT_MAX_BODY_BYTES } from './index.js'

describe('createServerConfig — SYNC_TOKEN (required)', () => {
  it('throws when SYNC_TOKEN is absent (a tokenless server is an auth hole)', () => {
    expect(() => createServerConfig({})).toThrow(/SYNC_TOKEN/)
  })

  it('throws when SYNC_TOKEN is the empty string', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: '' })).toThrow(/SYNC_TOKEN/)
  })

  it('throws when SYNC_TOKEN is whitespace-only', () => {
    expect(() => createServerConfig({ SYNC_TOKEN: '   ' })).toThrow(/SYNC_TOKEN/)
  })

  it('accepts a non-empty token and preserves it verbatim (no trim of the value itself)', () => {
    const cfg = createServerConfig({ SYNC_TOKEN: '  super-secret  ' })
    // The presence check trims, but the token used for auth keeps surrounding spaces if the user set them.
    expect(cfg.token).toBe('  super-secret  ')
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

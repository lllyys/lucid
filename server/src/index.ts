// Purpose: the serve entry for the self-hosted sync server (#9, WI-8d). Splits cleanly into a PURE,
// unit-tested config parser (`createServerConfig`) and an integration-only `main()` that opens the
// SQLite store, builds the Hono app (WI-8c), and binds a real port via @hono/node-server. Only
// `createServerConfig` is unit-tested; the listen/serve call is a socket bind (integration glue) and
// is exercised by deployment, not by `pnpm test`.
//
// Security: SYNC_TOKEN is REQUIRED and non-empty — there is no default, because a tokenless server is
// an open auth hole (createApp also rejects an empty token defensively). The token is NEVER logged: the
// single startup line prints only the port and DB path. DB_PATH defaults to a durable file ('sync.db'),
// never ':memory:' (that is a test-only store that loses all data on restart).

import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createSyncStore } from './db.js'

/** Durable default DB file. NOT ':memory:' — a real server must persist across restarts. */
export const DEFAULT_DB_PATH = 'sync.db'
/** Default listen port. */
export const DEFAULT_PORT = 8787
/** Default request-body cap: 5 MiB (kept in sync with createApp's own default). */
export const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024

export interface ServerConfig {
  token: string
  dbPath: string
  port: number
  maxBodyBytes: number
  /** Optional path to the built web-app dist to serve at the same origin (#15 WI-4). Unset = API-only. */
  staticDir?: string
}

/** A trimmed env value, or undefined when the var is absent / blank — so blank falls back to a default. */
function readTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/**
 * Parse a strictly-positive-integer-bounded env var. Rejects non-decimal-integer literals (floats,
 * hex, exponent, signs, junk) up front so Number() coercion can never lie. Returns the default when
 * the var is blank/absent; throws a clear, var-named Error when set-but-invalid.
 */
function parseBoundedInt(
  raw: string | undefined,
  name: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = readTrimmed(raw)
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got: ${value}`)
  }
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got: ${value}`)
  }
  return n
}

/**
 * Build the server config from a plain env map (injected, so it is pure + unit-testable). Validation:
 *  - SYNC_TOKEN: REQUIRED, non-empty after trim (throws otherwise) — no default, by design.
 *  - DB_PATH: optional, defaults to a durable file (never ':memory:').
 *  - PORT: optional, must parse to 1–65535 if set.
 *  - MAX_BODY_BYTES: optional, must be a positive integer if set.
 *  - STATIC_DIR: optional path to the built web app to serve at the same origin (#15); unset = API-only.
 */
export function createServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const token = env.SYNC_TOKEN
  if (token === undefined || token.trim().length === 0) {
    throw new Error('SYNC_TOKEN is required and must be non-empty (a tokenless server is an auth hole)')
  }

  const dbPath = readTrimmed(env.DB_PATH) ?? DEFAULT_DB_PATH
  const port = parseBoundedInt(env.PORT, 'PORT', 1, 65535, DEFAULT_PORT)
  const maxBodyBytes = parseBoundedInt(
    env.MAX_BODY_BYTES,
    'MAX_BODY_BYTES',
    1,
    Number.MAX_SAFE_INTEGER,
    DEFAULT_MAX_BODY_BYTES,
  )

  const staticDir = readTrimmed(env.STATIC_DIR)

  // Preserve the token VERBATIM — the trim above is only a presence check; the user may intentionally
  // include surrounding characters, and the auth comparison must use exactly what they configured.
  return { token, dbPath, port, maxBodyBytes, staticDir }
}

/**
 * Integration glue: read the real environment, open the durable store, build the app, and listen.
 * Not unit-tested (it binds a socket). NEVER logs the token — only the port + DB path.
 */
function main(): void {
  const config = createServerConfig(process.env)
  const store = createSyncStore(config.dbPath)
  const app = createApp({
    store,
    token: config.token,
    maxBodyBytes: config.maxBodyBytes,
    staticDir: config.staticDir,
  })
  serve({ fetch: app.fetch, port: config.port })
  // One startup line — the token is deliberately omitted (never log a secret, rule 65 §5).
  const serving = config.staticDir ? `, serving app from: ${config.staticDir}` : ''
  console.log(`lucid sync server listening on port ${config.port} (db: ${config.dbPath}${serving})`)
}

// Run only when executed as the entry point, not when imported by a test. This is the ESM-safe
// equivalent of `require.main === module`: resolve argv[1] through realpath + pathToFileURL so the
// comparison survives symlinked paths (e.g. macOS /tmp → /private/tmp, or a Docker bind mount) where a
// naive `file://${argv[1]}` string would mismatch the module's own resolved URL.
const entryUrl = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : ''
if (import.meta.url === entryUrl) {
  main()
}

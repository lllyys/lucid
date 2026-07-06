// Purpose: the serve entry for the self-hosted sync server (#9, WI-8d; #19 WI-1). Splits cleanly into a
// PURE, unit-tested config parser (`createServerConfig`) + an injectable stat gate
// (`assertTokenFreeDirReadable`), and an integration-only `main()` that opens the SQLite store, builds
// the Hono app (WI-8c), and binds a real port via @hono/node-server. `createServerConfig` and the stat
// gate are unit-tested; the listen/serve call is a socket bind (integration glue) and is exercised by
// deployment, not by `pnpm test`.
//
// Security: SYNC_TOKEN is REQUIRED and non-empty — EXCEPT in the token-free single-origin mode (#19
// WI-1), where a set STATIC_DIR authorizes a tokenless start (origin + the Tailscale ACL is the
// boundary; the token resolves to '' so createApp enters its token-free quadrant). To keep
// createServerConfig pure it does NOT stat STATIC_DIR; main() runs `assertTokenFreeDirReadable` (with
// fs.statSync injected) so a token-free start fails fast when STATIC_DIR is missing/not-a-directory
// rather than silently opening an UNAUTHENTICATED /sync behind a broken app. main() also logs a LOUD,
// consequence-naming line when token-free. The token is NEVER logged. DB_PATH defaults to a durable
// file ('sync.db'), never ':memory:' (a test-only store that loses all data on restart).

import { realpathSync, statSync, type Stats } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createSyncStore } from './db.js'
import { parseAllowedUpstreams } from './proxy.js'

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
  /**
   * The same-origin LLM-proxy allow-list (#28), parsed + normalized from `PROXY_ALLOWED_UPSTREAMS`.
   * Empty = the proxy is disabled (the default). Always present (never undefined) so createApp's proxy
   * routes read one shape.
   */
  allowedUpstreams: string[]
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
 *  - SYNC_TOKEN: REQUIRED non-empty UNLESS a STATIC_DIR is set (#19 WI-1: token-free single-origin). A
 *    blank/absent token WITH a STATIC_DIR resolves to '' (createApp's token-free quadrant); a blank
 *    token WITHOUT a STATIC_DIR throws (an API-only server with no auth is a footgun).
 *  - DB_PATH: optional, defaults to a durable file (never ':memory:').
 *  - PORT: optional, must parse to 1–65535 if set.
 *  - MAX_BODY_BYTES: optional, must be a positive integer if set.
 *  - STATIC_DIR: optional path to the built web app to serve at the same origin (#15); unset = API-only.
 *
 * PURE by design (#19 Gate-2 Low): it does NOT `stat` STATIC_DIR — the filesystem probe that authorizes
 * the token-free start lives in `assertTokenFreeDirReadable`, called by main() with fs.statSync injected.
 */
export function createServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const rawToken = env.SYNC_TOKEN
  const staticDir = readTrimmed(env.STATIC_DIR)
  const tokenBlank = rawToken === undefined || rawToken.trim().length === 0

  if (tokenBlank && staticDir === undefined) {
    throw new Error('SYNC_TOKEN is required and must be non-empty (a tokenless API-only server is an auth hole)')
  }
  // Token-free single-origin: a blank token with a STATIC_DIR resolves to '' so createApp enters its
  // token-free quadrant. Otherwise preserve the token VERBATIM — the trim above is only a presence
  // check; the user may intentionally include surrounding characters, and the auth comparison must use
  // exactly what they configured.
  const token = tokenBlank ? '' : (rawToken as string)

  const dbPath = readTrimmed(env.DB_PATH) ?? DEFAULT_DB_PATH
  const port = parseBoundedInt(env.PORT, 'PORT', 1, 65535, DEFAULT_PORT)
  const maxBodyBytes = parseBoundedInt(
    env.MAX_BODY_BYTES,
    'MAX_BODY_BYTES',
    1,
    Number.MAX_SAFE_INTEGER,
    DEFAULT_MAX_BODY_BYTES,
  )
  // #28: parse the operator's same-origin LLM-proxy allow-list. Pure (no I/O); empty when unset →
  // the proxy is disabled (POST /proxy 403s, GET /proxy advertises []).
  const allowedUpstreams = parseAllowedUpstreams(env.PROXY_ALLOWED_UPSTREAMS)

  return { token, dbPath, port, maxBodyBytes, staticDir, allowedUpstreams }
}

/** statSync-like probe — injected so the gate is unit-testable without touching the real filesystem. */
export type StatProbe = (path: string) => Stats

/**
 * The LOUD, consequence-naming startup warning for token-free single-origin mode (#19 WI-1). The
 * content is load-bearing (the operator must understand /sync is open) — pinned by a unit test.
 */
export const TOKEN_FREE_WARNING =
  'TOKEN-FREE single-origin mode — /sync is UNAUTHENTICATED, gated only by network reachability (Tailscale ACL). Plaintext workspace data.'

/** True when the config is the token-free single-origin quadrant (empty token + a staticDir). */
export function isTokenFree(config: ServerConfig): boolean {
  return config.staticDir !== undefined && config.token.trim().length === 0
}

/**
 * The token-free start gate (#19 WI-1). When (and ONLY when) the config is token-free, `stat` STATIC_DIR
 * and require it be a real readable directory — else throw and fail fast, so a typo (STATIC_DIR=/typo +
 * no token) can NEVER open an UNAUTHENTICATED /sync behind a 404ing app. A no-op for every other
 * quadrant (a token-authed or API-only server never reaches this gate's filesystem probe). The probe is
 * injectable for tests; main() passes fs.statSync. A throw from the probe (ENOENT) is treated as missing.
 */
export function assertTokenFreeDirReadable(config: ServerConfig, statProbe: StatProbe = statSync): void {
  if (!isTokenFree(config)) return
  const dir = config.staticDir as string
  let stats: Stats
  try {
    stats = statProbe(dir)
  } catch {
    throw new Error(
      `STATIC_DIR (${dir}) is not accessible — a token-free single-origin start requires a real readable directory`,
    )
  }
  if (!stats.isDirectory()) {
    throw new Error(`STATIC_DIR (${dir}) is not a directory — a token-free single-origin start requires one`)
  }
}

/**
 * Integration glue: read the real environment, open the durable store, build the app, and listen.
 * Not unit-tested (it binds a socket). NEVER logs the token — only the port + DB path. When token-free
 * (#19 WI-1) it FIRST stat-validates STATIC_DIR (fail fast, no socket bound) and logs a LOUD,
 * consequence-naming warning so the operator can never be surprised by an UNAUTHENTICATED /sync.
 */
function main(): void {
  const config = createServerConfig(process.env)
  // Fail fast BEFORE opening the store or binding a socket: a token-free start must have a real
  // STATIC_DIR, else we'd serve an open plaintext /sync behind a broken (404ing) app.
  assertTokenFreeDirReadable(config)
  if (isTokenFree(config)) console.warn(TOKEN_FREE_WARNING)
  // #28: LOUD, consequence-naming line when the same-origin LLM proxy is enabled, so the operator can
  // never be surprised that the server relays browser requests to these upstreams. Only the operator's
  // own allow-listed base URLs are printed (not secret); the relayed Authorization key is never logged.
  if (config.allowedUpstreams.length > 0) {
    console.warn(`LLM PROXY ENABLED — /proxy relays to allow-listed upstreams: ${config.allowedUpstreams.join(', ')}`)
  }
  const store = createSyncStore(config.dbPath)
  const app = createApp({
    store,
    token: config.token,
    maxBodyBytes: config.maxBodyBytes,
    staticDir: config.staticDir,
    allowedUpstreams: config.allowedUpstreams,
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

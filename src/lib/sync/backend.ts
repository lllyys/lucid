// Purpose: the sync transport (#9). `SyncBackend` is the single interface the orchestrator (WI-7)
// and queue (WI-6) depend on — never a vendor or raw fetch — mirroring the LLM provider layer's
// injectable-fetch pattern. `createRestSyncBackend` talks to the user's self-hosted server over a REST
// API, bounds every request with a timeout, validates the response through the WI-2 guards, and maps
// failures to a localized-mappable SyncError. Auth is a bearer header when a token is configured; an
// EMPTY token (#19 WI-2 token-free single-origin) OMITS the Authorization header entirely (conditional
// spread) — the server's token-free pass-through needs none. It NEVER throws across the boundary: every
// method returns a discriminated BackendResult. Retry/backoff + offline queueing are layered on top by
// the queue (WI-6); the backend is a single bounded request.

import { isPullResult, isPushResult } from './guards'
import type { PullResult, PushOp, PushResult, SyncError } from './types'

export type BackendResult<T> = { ok: true; value: T } | { ok: false; error: SyncError }

export interface SyncBackend {
  /** Pull entities changed since the cursor (`rev > since`). */
  pull(since: number): Promise<BackendResult<PullResult>>
  /** Push local changes; each op gets an applied/conflict result. */
  push(ops: PushOp[]): Promise<BackendResult<PushResult[]>>
  /** Erase all of this client's data on the server (disconnect-and-erase). */
  purge(): Promise<BackendResult<void>>
}

export interface RestBackendConfig {
  baseUrl: string
  token: string
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch
  /** Per-request deadline; a hung server aborts into the unreachable error. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

/** HTTP status → SyncError: auth for 401/403, unreachable for 5xx, badRequest for other 4xx. */
function statusError(status: number): SyncError {
  if (status === 401 || status === 403) return { kind: 'auth' }
  if (status >= 500) return { kind: 'unreachable' }
  return { kind: 'badRequest' }
}

const isPushResultArray = (v: unknown): v is PushResult[] => Array.isArray(v) && v.every(isPushResult)

export function createRestSyncBackend(config: RestBackendConfig): SyncBackend {
  const doFetch = config.fetch ?? fetch
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const base = config.baseUrl.replace(/\/+$/, '') // trim trailing slash so `${base}/sync/...` is clean

  async function request<T>(
    path: string,
    method: string,
    body: unknown,
    validate: ((v: unknown) => v is T) | null,
  ): Promise<BackendResult<T>> {
    const controller = new AbortController()
    // The timer stays armed until AFTER the body is read (single outer finally) so a server that
    // sends headers then hangs the body is still bounded end-to-end, not just at the header phase.
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let payload: string | undefined
      if (body !== undefined) {
        try {
          payload = JSON.stringify(body)
        } catch {
          return { ok: false, error: { kind: 'badRequest' } } // non-serializable payload (BigInt/circular)
        }
      }
      let res: Response
      try {
        // Only WE set headers — no caller-supplied headers can shadow the bearer auth. An EMPTY token
        // (#19 WI-2 token-free single-origin) OMITS the Authorization key entirely via a conditional
        // spread — never sends a useless `Bearer ` (the server's token-free pass-through ignores any
        // header, and a real token server would 401 it anyway).
        res = await doFetch(`${base}${path}`, {
          method,
          body: payload,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
          },
        })
      } catch {
        return { ok: false, error: { kind: 'unreachable' } } // network failure OR timeout-abort
      }
      if (!res.ok) return { ok: false, error: statusError(res.status) }
      if (validate === null) return { ok: true, value: undefined as T } // no body (e.g. purge → 204)
      let parsed: unknown
      try {
        parsed = await res.json()
      } catch {
        // A body-read abort (timeout) is unreachable; a genuinely unparseable 2xx body is badRequest.
        return { ok: false, error: { kind: controller.signal.aborted ? 'unreachable' : 'badRequest' } }
      }
      if (!validate(parsed)) return { ok: false, error: { kind: 'badRequest' } } // 2xx but wrong shape
      return { ok: true, value: parsed }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    pull: (since) => request(`/sync/changes?since=${since}`, 'GET', undefined, isPullResult),
    push: async (ops) => {
      const res = await request<PushResult[]>('/sync/changes', 'POST', ops, isPushResultArray)
      if (!res.ok) return res
      // The server must return exactly one result per pushed op (by id) — else we can't reconcile a
      // push outcome to its op. A short/duplicated/foreign-id result set is a malformed response.
      const resIds = new Set(res.value.map((r) => r.id))
      if (res.value.length !== ops.length || !ops.every((o) => resIds.has(o.id))) {
        return { ok: false, error: { kind: 'badRequest' } }
      }
      return res
    },
    purge: () => request<void>('/sync/data', 'DELETE', undefined, null),
  }
}

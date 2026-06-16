---
branch: feat/feature-9-wi-4-backend
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-4 (createRestSyncBackend)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1..3. Foundational WI. Files:
`src/lib/sync/backend.ts` + test (the sync transport: `SyncBackend` interface + `createRestSyncBackend`).

## Round 1 — verdict: NEEDS WORK (1 High + 3 Medium)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | backend.ts push body | High | `JSON.stringify(ops)` ran OUTSIDE `request`'s try → a non-serializable payload (BigInt/circular) throws, breaking the never-throws contract | **FIXED** — `request` takes `body: unknown`; serialization moved inside a guarded try → `badRequest` (fetch not called) |
| 2 | backend.ts timer | Medium | the abort timer was cleared after headers resolved, before `res.json()` → the body read was unbounded (a server can stall the body) | **FIXED** — single outer `try/finally`; the timer stays armed through `res.json()`; a body-read abort → `unreachable` (via `controller.signal.aborted`), an unparseable 2xx → `badRequest` |
| 3 | backend.ts headers | Medium | header spread let `init.headers` shadow `Authorization` (latent footgun) | **FIXED** — removed caller headers entirely; `request` takes explicit `method`/`body`; only we set `Authorization` + `Content-Type` |
| 4 | backend.ts push | Medium | `push` validated only `PushResult[]` shape, not one-result-per-op → a `[]`, dup-id, or foreign-id response passed | **FIXED** — after shape validation, `push` requires `res.value.length === ops.length && every op id present in the result ids`, else `badRequest` |

Confirmed-fine in R1: retry/backoff deferral to WI-6 is the correct layering (backend = single bounded request; the queue owns drain/reconnect); timeout-as-`unreachable` is acceptable with the current `SyncError` shape; no token logging (bearer header is the right channel, never a URL query).

## Round 2 — verdict: CLEAN

> "All four round-1 issues are resolved … non-serializable push payloads return `badRequest` without
> calling fetch. The timeout now covers both header and body phases and is cleared in the outer
> `finally`. Auth headers can no longer be shadowed. Push responses are correlated back to the pushed
> op ids and count … The body-abort mapping to `unreachable` is sound … CLEAN."

## Notes

`SyncBackend` = `{ pull(since), push(ops), purge() }`, each returning a discriminated
`BackendResult<T>` (never throws). `createRestSyncBackend({baseUrl, token, fetch?, timeoutMs?})`:
bearer auth, AbortController timeout (default 15s) covering headers + body, guard-validated responses
(`isPullResult` / `PushResult[]`), `SyncError` mapping (401/403→auth, 5xx + network + timeout→
unreachable, other 4xx + unparseable/wrong-shape→badRequest). Endpoints match the WI-8 server plan
and the Phase-0 spike: `GET /sync/changes?since=N`, `POST /sync/changes`, `DELETE /sync/data`.
Retry/backoff/queueing is layered by WI-6.

Compliance: no `any`, no zod, file < ~300 lines, no vendor leak, token never logged (rule 65 §5).
`pnpm check:all` green — 725 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. Foundational tier — fetch-mocked unit
tests + audit satisfy verification.

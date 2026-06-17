---
branch: feat/feature-9-wi-8c-hono-http
threadId: independent-claude-auditor (Codex quota-blocked until ~Jun 18 11:38)
rounds: 2
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — feature #9 WI-8c (Hono HTTP + bearer-auth layer)

`createApp({ store, token }) → Hono` — the HTTP edge of the self-hosted server: a constant-time
bearer-auth guard + the three routes the lucid web client calls (`GET`/`POST /sync/changes`,
`DELETE /sync/data`), wrapping the WI-8b store and mapping failures to the client's status→error
contract (401/403→auth, other-4xx→badRequest, 5xx→unreachable). Files: NEW `server/src/app.ts` +
`server/src/app.test.ts`; a coordinating change to `server/src/db.ts` (exported `InvalidOpError`).

## Auditor note (rule-47 fallback)

Codex quota exhausted (until ~Jun 18 11:38). Both rounds used a fresh independent read-only Claude
`auditor` subagent (separate context from the implementer — rule-48 boundary). The implementation was
drafted by a fresh-context subagent and reviewed + gate-verified + fixed by the orchestrator (rule 48).

## Round 1 — NEEDS WORK (1 Medium; 2 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Medium | the POST `/sync/changes` `try/catch` was too broad: `store.applyOps` throws for BOTH a malformed op (→ should be 400) AND an internal SQLite fault (→ should be 500), but both were mapped to 400. A transient server-side push failure was misclassified to the client as non-retryable `badRequest` (the push dropped instead of retried). | **FIXED** — `db.ts` now exports `class InvalidOpError extends Error {}`; `assertValidOp` throws it. The POST catch maps ONLY `InvalidOpError` → 400 and RE-THROWS anything else → Hono `onError` → 500. New test: a VALID op against a store whose `applyOps` throws a plain Error → 500 (not 400). |
| L1 | Low | empty/whitespace configured token → `digest('') === digest('')`, so a bare `Bearer ` would authenticate. | **FIXED** — `createApp` throws if `deps.token.trim().length === 0`. Tests cover `''` and `'   '`. |
| L2 | Low | the 500-mapping test only covered GET, not POST. | **FIXED** — added the POST-internal-error→500 test above. |

Round-1 affirmed CORRECT (verified against installed Hono 4.12.25 internals): constant-time auth via
SHA-256-digest + `timingSafeEqual` (no value OR length leak; fail-closed; `app.use('*')` covers all
routes + unknown paths; case-insensitive header; trailing-space rejected; `await next()` correct);
GET/DELETE status mapping; `parseSince` (`^\d+$` + `Number.isSafeInteger` + `>=0` rejects abc/-1/1.5/
0x1/1e3/''/whitespace/20-digit); response hygiene (no token/stack-trace leak, generic `onError`);
body-size limit correctly deferred to the WI-8d serve layer; lucid compliance.

## Round 2 — verdict: CLEAN

> "The round-1 Medium … is correctly fixed: `InvalidOpError` cleanly separates client validation errors
> (400) from internal faults (re-throw → `onError` → 500), the re-throw is routed by Hono's async
> dispatch to `onError` exactly as GET/DELETE throws are, `assertValidOp` is the sole `InvalidOpError`
> thrower and runs before `BEGIN IMMEDIATE` (so a 400 persists nothing), and the empty/whitespace-token
> guard closes the `digest('') === digest('')` bypass. No regressions … lucid compliance holds. …
> (no Critical / High / Medium / Low findings) … CLEAN."

`cd server && pnpm test` → 57 passed (3 files); `cd server && pnpm typecheck` → green. Root
`pnpm check:all` unaffected (server excluded): 68 files / 917 tests / 100%.

## Carried to WI-8d (the serve layer)

- The `@hono/node-server` entry MUST set a **request-body-size limit** (an unbounded JSON body / ops
  array is an availability risk — the store loops one transaction per op). It MUST also reject an
  empty/whitespace `SYNC_TOKEN` at startup (createApp now also guards this).

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium; round-2 zero findings.

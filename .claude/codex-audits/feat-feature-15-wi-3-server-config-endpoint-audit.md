---
branch: feat/feature-15-wi-3-server-config-endpoint
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-19
---

# Gate-4 audit — feature #15 WI-3 (server `/config` endpoint)

Independent separate-context Claude `auditor` (read-only); Codex quota-blocked (rule 48 via subagent).
SECURITY-SENSITIVE: adds an UNAUTHENTICATED endpoint to a bearer-protected server that stores the
user's E2E-encrypted API key.

## Diff (`git diff main -- server/`)
- `server/src/db.ts` — `config` single-row table (`CHECK (id=1)`) + `getConfig`/`putConfig` (optimistic-
  concurrency mirroring the entity `baseRev` contract) + `ConfigResult` type.
- `server/src/app.ts` — `GET /config` / `PUT /config` (64KB cap), `/config` exempted from bearer auth.
- `server/src/app.test.ts` — `/config` describe block (10 cases) + the two broken-store mocks updated.

## Verdict: ship-as-is — 0 Critical / 0 High / 0 Medium (2 Low)

Auditor-verified (incl. reading Hono's `getPath`/dispatch/`bodyLimit` internals):
- **Auth exemption SOUND**: Hono computes ONE `path` for both routing + `c.req.path` (can't diverge);
  exact-string `=== '/config'` + strict routing → `/config/`, `?`-tricks, case, percent-encoding cannot
  reach `/sync`. `/sync` stays 401 (regression-tested). Exempting E2E ciphertext is defensible
  (passphrase-useless blob + Tailscale perimeter + "no token" requirement + optimistic-concurrency).
- **Optimistic-concurrency CORRECT**: `BEGIN IMMEDIATE` makes the rev-check+bump atomic (synchronous
  node:sqlite → no TOCTOU); first-write→rev 1; stale baseRev→409 authoritative + row UNCHANGED
  (no-clobber tested); monotonic rev.
- **Key safety**: blob `JSON.stringify`d in / `JSON.parse`d out, NEVER inspected or logged; round-trips
  intact; a GET parse-throw (only on external DB corruption) → 500 via `onError`.
- **Body cap**: 64KB via `bodyLimit` (handles Content-Length AND chunked) → over-cap 413 pre-parse,
  nothing stored (tested). **Single-row**: `CHECK (id=1)` + hardcoded-id upsert → no 2nd row possible.
- **Validation/errors** mirror `/sync` (400/409/200); `isNonNegInt` narrows correctly. No `any`, no new
  deps, files <300 lines, Purpose headers updated (no comment rot).

## Low findings
| # | finding | resolution |
|---|---|---|
| 1 | `isRecord(body.blob)` accepts any non-null object (not the crypto envelope shape). | Accepted — INTENTIONAL per the plan's "opaque blob, server never inspects" mandate (validating envelope shape would couple the server to the crypto format). Confirmed. |
| 2 | A huge-but-valid `baseRev` on an empty store wasn't directly asserted (first-write ignores baseRev). | **FIXED** — added a test pinning first-write→rev 1 regardless of baseRev. |

Server: typecheck + build + 95 tests green. Root `pnpm check:all` green (server excluded; `src/` untouched).

---
branch: feat/feature-15-wi-4-serve-app
threadId: independent-claude-auditor
rounds: 1
final_verdict: follow-up-recommended
date: 2026-06-19
---

# Gate-4 audit — feature #15 WI-4 (serve app same-origin + rescope auth)

Independent separate-context Claude `auditor` (read-only, read Hono + @hono/node-server internals);
Codex quota-blocked (rule 48 via subagent). SECURITY-RELEVANT (changes the server's auth scope + adds
unauthenticated static serving).

## Diff (`git diff main -- server/ vite.config.ts dev-docs/`)
- `server/src/app.ts` — auth rescoped global `*` → `/sync/*`; optional `staticDir` → serveStatic mounted
  last.
- `server/src/index.ts` — `STATIC_DIR` env → `config.staticDir` (unset = API-only).
- `vite.config.ts` — dev proxy `/config` + `/sync` → :8787.
- `server/src/{app,index}.test.ts` — static-serving + STATIC_DIR tests.
- `dev-docs/sync-server.md` + `dev-docs/README.md` — `/config` + HTTPS-mandatory + STATIC_DIR docs.

## Verdict: follow-up-recommended — 0 Critical / 0 High / 0 Medium (3 Low, all fixed)

Auditor-verified:
- **Auth rescope SECURE**: `/sync/*` covers `/sync/changes` (GET+POST) + `/sync/data` (DELETE) → all stay
  401 unauthenticated (tested). No plaintext-data route is outside the scope. Positively-scoped auth is
  cleaner than the prior global+exemption. All bearer-auth tests still meaningfully assert protection.
- **Path-traversal SECURE** (read `@hono/node-server@2.0.5` serve-static.mjs): rejects `.`/`..` segments,
  `//`, backslashes after one decode; Hono's getPath decodes `%XX` once so `%2e%2e`/double-encoding are
  caught → `..` escapes 404, can't read outside staticDir.
- **Backward-compat**: unset STATIC_DIR → API-only (pre-#15). Startup log prints the path (not the token).
- **vite proxy** is dev-server-only — zero effect on the vitest run/coverage. **No new deps** (serveStatic
  from the already-present @hono/node-server). Files <300 lines. No `any`.

## Low findings (all FIXED in this branch)
| # | finding | resolution |
|---|---|---|
| 1 | **No local path-traversal regression test** — the defense lives entirely in the pinned dependency; a future `pnpm update` could silently regress it. (Auditor flagged as the one worth doing before merge.) | **FIXED** — added an `it.each` asserting `%2e%2e`/encoded `../`/backslash traversal → 404, pinning the security behavior to our own suite. |
| 2 | No test that `PUT /config` still works with `staticDir` mounted (mount-order regression guard). | **FIXED** — added a PUT-with-staticDir test (→ 200). |
| 3 | Mild doc tension: §3 frames TLS as advisory (for `/sync`) while `/config` needs it as a HARD requirement. | **FIXED** — added a forward-reference from §3 to the "HTTPS is MANDATORY for `/config`" section. |

Server: typecheck + build + **107 tests** green. Root `pnpm check:all` green (server excluded; `src/`
untouched apart from `vite.config.ts` dev-only proxy).

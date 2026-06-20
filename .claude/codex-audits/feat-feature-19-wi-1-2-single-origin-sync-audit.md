---
branch: feat/feature-19-wi-1-2-single-origin-sync
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-20
---

# Gate-4 audit — feature #19 WI-1+WI-2 (token-free single-origin /sync)

Independent Claude auditor (Codex quota-blocked; rule-48 separate context), read-only, security-focused
on the auth-boundary relaxation. Against plan v2 (Gate-2-passed). **ship-as-is, 0 open Crit/High/Med.**
(First dispatch read the wrong tree — `main`, which lacks this unmerged code; re-run pointed at the
worktree where the branch lives.)

## Security boundary — PASS
- **Single shared `tokenFree`** (`app.ts:115` = `staticDir !== undefined && token.trim().length === 0`)
  drives BOTH the startup-throw skip (`:121`) and the middleware choice (`:136`) — no second predicate.
  `index.ts`'s `isTokenFree()` mirrors the identical formula for the stat gate + log.
- **Quadrant 2 (staticDir + token set) stays bearer-authed** — `tokenFree` is false whenever the token is
  non-empty, regardless of `staticDir`. Named regression `app.test.ts:502-513` (+ pre-existing `:151-153`
  preserved). **No path drops auth on a token-configured server.**
- **Quadrant 3 (no staticDir + empty token) still throws** (`app.test.ts:517`, `index.test.ts:25`).
- **Pass-through guard** (`app.ts:137` bare `next()`) ignores any Authorization header (stale `Bearer x`
  → 200, `app.test.ts:451`); never `tokenMatches` against `''`. The `/sync/changes` body cap is
  route-level, preserved in token-free mode (413 test `:471`).
- **STATIC_DIR stat gate** — `createServerConfig` kept PURE (no stat; `index.test.ts:60`); the probe is
  `assertTokenFreeDirReadable` (injectable `StatProbe`) called in `main()` BEFORE socket bind (`:158`);
  fail-fast on missing/non-directory/probe-throw (`index.test.ts:87/107`); no-op for other quadrants.
  Loud `TOKEN_FREE_WARNING` emitted + content pinned.
- **Client**: `backend.ts:79` conditional spread → empty token OMITS the Authorization key (test
  `toBeUndefined()`, not `=== ''`); real token unchanged. `connectSingleOrigin` targets
  `window.location.origin` + `token:''` + `connect()` re-seed.

## No regression — PASS
Token-authed mode byte-for-byte unchanged (the `else` bearer branch is verbatim; all pre-existing auth
tests run). Persisted token configs unaffected (`migrateSync` already accepted `''`). The 2 component
touch-points are test-mock additions only (no production UI — WI-3 design-gated).

## Test quality — PASS
The security tests are non-vacuous: the quadrant-2 regression fails if `tokenFree` were computed from
`staticDir` alone; stale-Bearer→200 fails if the guard rejected; stat fail-fast fails if it silently
opened; header-key-absence (`toBeUndefined`) fails on a `Bearer ` regression.

## lucid compliance — PASS
No `any`; files <300 (app 241, index 180, backend 118, syncStore 152, syncController 143); 4-quadrant
header comment; `dev-docs/sync-server.md` doc-sync accurate. Gates: root `pnpm check:all` (1421 tests,
100% coverage, build) + server (132 tests, typecheck, build) — both green.

## Lows (accepted, non-blocking)
1. `main()` warning emission spied only on content, not the `console.warn` call (integration-only by the
   file's stated boundary; content is the load-bearing part) — accepted.
2. `backend.ts:81` truthiness guard would send `Bearer   ` for a whitespace-only token (the server
   `.trim()`s). **Unreachable** — `connectSingleOrigin` sets exactly `''` and no caller produces a
   whitespace token; cosmetic latent inconsistency only — accepted.
3. `syncStore.ts` header comment could note the `token:''` token-free sentinel (the `connectSingleOrigin`
   TSDoc already explains it) — accepted.

## Verdict
ship-as-is. WI-1+WI-2 (the headless token-free layer) is correct + safe. WI-3 (Settings·Sync UI) remains
design-gated (needs-design #151) — the feature stays IN PROGRESS until that ships.

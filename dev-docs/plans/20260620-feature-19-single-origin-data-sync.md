# Feature #19 — Unify workspace-data sync (#9) onto the single-origin server (token-free)

Status: Gate 2 PASSED (v2, security-audited 2 rounds, 0 open) · GH #147 · relates to #45 (#9), #111 (#15)

> **Gate-2 round-2 verdict: READY TO BUILD, 0 Crit/High/Med.** One non-blocking Low folded into WI-1:
> keep `createServerConfig` pure — put the `STATIC_DIR` `stat` probe in `main()` (the integration glue,
> `index.ts:100`) or inject a `statSync`-like probe, not inside the pure config parser.

## Problem
The app is served single-origin from `@lucid/server` (#15), yet the #9 workspace-data sync still makes the
user configure a separate bearer token + URL in Settings·Sync. The user chose (triage 2026-06-20) to
**unify onto single-origin** — "syncs through the same server you already reach (like #15's config), so the
only state is on/off." Auto-target the served origin (no URL), auth by origin-reachability + the Tailscale
ACL instead of a typed token (like `/config`).

## Decision — token-free `/sync` ONLY in single-origin-without-token mode (the four quadrants)
Today `app.use('/sync/*', bearer-auth)` is token-gated and `createApp` **throws** on an empty token
(`server/src/app.ts:94`) — deliberate, because `/sync` carries **plaintext** data (sessions/glossary),
unlike `/config`'s ciphertext (`app.ts:98-104`). v1 relaxes this for **exactly one quadrant**:

| `staticDir` | `token` | `/sync` behavior |
|---|---|---|
| set | **empty** | **token-free** (the new mode — origin + tailnet ACL is the boundary) |
| set | set | **bearer-authed** (single-origin server that ALSO wants a token — MUST stay protected) |
| unset | empty | **throw at startup** (API-only with no auth is a footgun — preserved) |
| unset | set | bearer-authed (unchanged) |

**The relaxation predicate is a SINGLE shared boolean** computed once and used for BOTH the startup-throw
skip AND the middleware skip, so they can never drift:
```
const tokenFree = deps.staticDir !== undefined && deps.token.trim().length === 0
```
- `tokenFree === true` → do NOT throw at `:94`; register `/sync/*` behind a **pass-through guard**
  (`async (c, next) => next()`), NOT the bearer middleware, and NOT a `tokenMatches` against an empty
  token (which would `digest('')` and reject everything). The pass-through **ignores** any `Authorization`
  header a client happens to send (e.g. a stale `Bearer x`) → still 200. The `/sync/changes` body-size cap
  stays on the route (it is not part of the auth middleware) — preserved.
- `tokenFree === false` → behavior is **byte-for-byte unchanged**: empty-token-without-staticDir still
  throws; any configured token still bearer-gates `/sync` (quadrant 2 + 4). The existing
  `app.test.ts:151-153` regression (a token server 401s a missing bearer) is PRESERVED, not deleted.

**STATIC_DIR is the authorization for token-free mode, so it must be real, not just non-blank.** Today
`createServerConfig` validates `STATIC_DIR` only as a non-empty string (`index.ts:89`, no `stat`). A typo
(`STATIC_DIR=/typo`) + no token would otherwise enter token-free mode and serve an **open** `/sync` while
`serveStatic` 404s the app — a tokenless open plaintext endpoint behind a broken app. Fix both:
1. **Entry validates the dir** — `createServerConfig`/the serve entry `stat`s `STATIC_DIR` and requires it
   be a readable directory before allowing the no-`SYNC_TOKEN` start; a missing/unreadable dir → fail fast
   with a clear error (do NOT silently enter token-free mode).
2. **Loud, consequence-naming startup log** — when `tokenFree`, the server logs exactly:
   `"TOKEN-FREE single-origin mode — /sync is UNAUTHENTICATED, gated only by network reachability (Tailscale ACL). Plaintext workspace data."`
   so the operator can never be surprised. The log content is load-bearing, not cosmetic.

**Trade-off (explicit):** token-free `/sync` means anyone who can reach the origin (is on the tailnet) can
read/write the plaintext workspace data — strictly weaker than the typed token, but the user's "like #15"
choice + the single-tenant self-hosted-behind-Tailscale model. Access is no weaker than `/config` (also
origin-gated); only the data is plaintext where `/config` is ciphertext. **Encrypting `/sync` at rest is a
documented follow-up**, not v1. Same-origin → **no CORS surface** (unchanged from #15's `/config`).

## Surface area (file-by-file)
- **`server/src/app.ts`** — compute the single `tokenFree` boolean; relax the `:94` throw only when
  `tokenFree`; register `/sync/*` behind a pass-through guard when `tokenFree`, else the existing bearer
  middleware (quadrants 2/4 unchanged). Keep the body-size cap on the route. Header comment documents the
  four quadrants + the shared predicate.
- **`server/src/index.ts`** — permit a no-`SYNC_TOKEN` start ONLY when `STATIC_DIR` is set AND `stat`s to a
  readable directory (else fail fast); keep requiring `SYNC_TOKEN` for API-only. Emit the loud token-free
  log line above when applicable.
- **`src/lib/sync/backend.ts`** — `createRestSyncBackend`: build the request headers with a **conditional
  spread** so an empty token OMITS the key entirely (never sends `Bearer `):
  `headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: \`Bearer ${config.token}\` } : {}) }`.
  Everything else (timeout, body cap, guards) unchanged.
- **`src/stores/syncStore.ts`** — `SyncConfig.token` may be `''` for single-origin (already passes the
  cross-version `migrateSync` `typeof === 'string'` guard at `:105`; the same-version rehydrate path runs
  no guard, so `''` is accepted on both paths — confirmed). Add `connectSingleOrigin()` that builds a
  config targeting `window.location.origin` with `token: ''` and routes through the existing
  `connect()` (which resets `cursor:0/seeded:false/revs:{}` — a server change → a fresh, idempotent seed,
  the correct behavior when switching FROM a remote token server).
- **`src/lib/sync/syncController.ts`** — `createBackend` already maps `{baseUrl: serverUrl, token}`; an
  empty token flows to the token-free backend. Add a controller affordance to connect to the current origin
  token-free (calls `connectSingleOrigin`). No UI.

### Files OUT of scope (v1)
- **Settings·Sync UI simplification (token/URL fields → on/off) + the pill copy** — changes the committed
  `lucid-sync` design surface → **rule-51 design-gated**, filed as `needs-design` + a UI WI-3 BLOCKED until
  the bundle lands (logic-first, like #15). `connectSingleOrigin` is wired to **nothing user-reachable**
  until WI-3 — by design; WI-1/WI-2 are foundational (no browser-verifiable slice).
- Encrypting `/sync` at rest (ciphertext hardening) — follow-up.
- Any change to the existing token-based remote sync path.

## Prior art / precedent / rejected alternatives
- **Precedent:** #15's `/config` is token-free single-origin on the same server + Tailscale boundary; the
  `app.ts:98-104` comment already anticipated "no token to type." Injectable backend mirrors the provider
  layer.
- **Rejected — auto-provision a secret token to the same-origin app:** security-equivalent to token-free
  (any same-origin requester gets it) with more moving parts + false comfort.
- **Rejected — keep the typed token (do nothing):** contradicts the user's explicit "drop the token" choice.

## Work-item sequencing
- **WI-1 (foundational · patch) — server token-free single-origin mode.** `app.ts` (shared `tokenFree`,
  pass-through guard, quadrants) + `index.ts` (stat STATIC_DIR, no-token-only-with-staticDir, loud log).
  Server `vitest`.
- **WI-2 (foundational · patch) — client token-free backend + connect-to-origin.** `backend.ts`
  (conditional-spread header), `syncStore` (`connectSingleOrigin`), controller affordance. Client tests.
  **Gate-5 tier:** foundational — verified by unit tests only; the connect path has NO UI entry point until
  WI-3, by design (rule 51).
- **WI-3 (behavioral · DESIGN-GATED → BLOCKED) — Settings·Sync simplification UI.** `needs-design`; not
  built this pass.

## Test catalogue
- **`server/.../app.test.ts`** (extend):
  - token-free quadrant (staticDir set + no token): `/sync` reachable WITHOUT an Authorization header (200).
  - **quadrant-2 regression (named):** `createApp({ staticDir, token: TOKEN })` → `/sync` still 401s a
    missing bearer — the single-origin-WITH-token server stays protected. (Preserve `app.test.ts:151-153`.)
  - token-free server + a request carrying a **stale `Bearer x`** → still 200 (header ignored, not rejected).
  - whitespace-only token + staticDir behaves identically to empty + staticDir (pin: both → token-free).
  - API-only (no staticDir) + empty token → still throws at startup (footgun preserved).
  - token-free `purge()` (`DELETE /sync/data`) → success (204) — the erase path works token-free.
  - the loud token-free startup log is emitted (assert the warning fires) when `tokenFree`.
- **`src/lib/sync/backend.test.ts`** (extend):
  - empty token → request `init.headers` has **no `Authorization` key**
    (`expect((init.headers as Record<string,string>).Authorization).toBeUndefined()`) — NOT `=== ''`.
  - a real token → `Authorization: Bearer <token>` (unchanged, `:21`).
- **`src/stores/syncStore.test.ts`** (extend): `connectSingleOrigin` targets `window.location.origin` with
  `token: ''` + routes through `connect()` (cursor/seeded/revs reset); an empty-token config persists +
  rehydrates on both the migrate and same-version paths.

## Risks + mitigations
- **Security regression (core):** token-free activates ONLY on the single shared `tokenFree` boolean
  (`staticDir set AND token empty`), never `staticDir` alone; quadrant 2 keeps its bearer gate (named
  regression test). STATIC_DIR is `stat`-validated so a typo can't open an unauthenticated `/sync`. The
  loud log names the consequence. Gate-2 round 1 raised exactly these (H1/H2/H3) — addressed here.
- **Empty-`Bearer` footgun:** the client omits the header entirely when token-free (conditional spread,
  asserted by key-absence); the server pass-through ignores any header. Neither sends/needs `Bearer `.
- **Mode flip between restarts (both directions, fails-closed):**
  - token-free → token: existing token-free clients (config `token:''`) send no header → 401 `auth-error`
    (safe, surfaced; the operator must reconfigure clients). Data intact.
  - token → token-free: a client with an old `token` keeps sending `Bearer <token>`, which the pass-through
    ignores → still 200. Data intact. Neither direction corrupts data.

## Backward compat
A persisted token-based `SyncConfig` is unchanged; a server started WITH `SYNC_TOKEN` is byte-for-byte
unchanged. Only a server started single-origin WITHOUT a token (and with a valid `STATIC_DIR`) enters the
new mode. No data migration. Mode-flip directions analyzed above (both fail closed).

## Audit fixes applied (Gate 2, round 1 → v2)
Independent Claude auditor (Codex quota-blocked; rule-48 separate context), round 1 = NEEDS REVISION
(0 Crit · 3 High · 4 Med · 3 Low). All addressed:
- **H1** prose predicate → a single shared `tokenFree` boolean for both throw-skip + middleware-skip; +
  whitespace-token test.
- **H2** the staticDir+token quadrant pinned to stay bearer-authed (4-quadrant table + named regression
  test preserving `app.test.ts:151`).
- **H3** STATIC_DIR `stat`-validated before authorizing token-free + a loud consequence-naming startup log.
- **M4** pass-through guard (ignore Authorization in token-free; keep body cap) + stale-Bearer→200 test.
- **M5** conditional-spread header; test asserts Authorization key ABSENCE, not `=== ''`.
- **M6** `connectSingleOrigin` routes through `connect()` re-seed (server-change semantics) — confirmed.
- **M7** WI-2 Gate-5 tier = foundational, unit-only, no UI entry until WI-3 (rule 51).
- **Lows** mode-flip both directions in backward-compat; CORS non-issue stated; token-free purge test;
  `migrateSync`-vs-rehydrate doc correction.

## Revision history
- v1 (2026-06-20) — initial draft.
- v2 (2026-06-20) — Gate-2 round-1 security fixes (3 High + 4 Med + 3 Low). Awaiting round-2 confirm.

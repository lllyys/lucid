# Feature #28 — Same-origin LLM proxy in @lucid/server

Status: Gate 2 (v2, audited round 1) · GH #232 · follow-up to bug #10 (#228) · rule 65 §5 (the server/proxy boundary)

## Problem
lucid (browser app) fetches a custom/local LLM endpoint **directly**. Hosted vendors are fine, but a
**custom/local** endpoint (vLLM, Ollama) is blocked by **browser-only** restrictions the endpoint's CORS can't
fix: **mixed content** (`https://` page → `http://` endpoint), **Chrome PNA** (public/https origin → private IP),
sometimes reachability. (CORS is usually already `*`.) Bug #10 shipped the *diagnosis* (v0.23.2). This is the
*fix*: `@lucid/server` (already serving the app single-origin) **relays** the request server-side, so the browser
call is same-origin (no browser restriction) and the SERVER makes the `http://`/private-IP fetch.

## Design (v2 — reworked after Gate-2 r1)
**Capability model, direct-by-default (fixes H2 — no regression).** The proxy is **opt-in by the operator** via
an env allow-list, and the client proxies a custom provider ONLY when its base URL is in the server's advertised
allow-list. Every other case (built-in vendor, allow-list empty, base URL not listed, not single-origin) uses
the **existing direct path unchanged**. So a deployment that sets nothing behaves exactly as today; a
direct-working custom provider that isn't listed stays direct. No forced proxy, no 403-on-upgrade.

- **Server advertises the allow-list**: `GET /proxy` returns `{ upstreams: string[] }` (the operator's allowed
  base URLs — not secret). Auth-gated like `/sync` (bearer when `SYNC_TOKEN` set; open only in the token-free
  single-origin quadrant — fixes H4). The client fetches it once on connect + caches it (no per-run request, no
  wasted failed direct attempt).
- **Client routing predicate**: proxy iff `config?.serverUrl === window.location.origin` **AND `config.token === ''`**
  (token-FREE single-origin only — Gate-2 r2 M-A) AND `vendor === 'custom'` AND the provider's normalized base URL
  ∈ the cached allow-list. **Why token-free-only:** the client sends the custom provider's key as the
  `Authorization` header; a token-SET `/proxy` gate would also want `Bearer <serverToken>` on that same header —
  one header can't be both. So a **token-set single-origin server uses the direct path** (documented degradation);
  the token-free single-origin deploy (the common case — and the user's) is the proxy path. `/proxy` is still
  auth-gated server-side in the token-set quadrant as defense (below), even though the client won't use it there.

## Prior art / precedent
- `@lucid/server` (#9/#19) Hono app — routes stream via `c.body(...)`; `@hono/node-server` pipes a `fetch`
  `res.body` (web ReadableStream) un-buffered (Gate-2 r1 confirmed — no `hono/streaming` helper needed).
- `createProvider` (`src/providers/index.ts`) → `openaiCompatibleStream` (via `defineProvider`); `ProviderConfig`
  (`src/providers/types.ts`) — the seam to thread a `proxy` dep. TWO custom call sites: `usePanelRun.ts` +
  `useTestConnection.ts` (both must inject — Gate-2 r1 M7).
- `syncStore.config` (`src/stores/syncStore.ts:59-96`); the token-free single-origin connect targets
  `window.location.origin`.

## SSRF / security model (Gate-2 r1 H3/H4/L8)
- **Operator env allow-list** `PROXY_ALLOWED_UPSTREAMS` — comma-separated **full base URLs** (e.g.
  `http://100.80.151.31:8000/v1,http://localhost:11434/v1`). Default empty → `/proxy` POST 403s + `GET /proxy`
  returns `{upstreams:[]}` → client never proxies. Bounds the destination set to operator-named targets (so the
  localhost/private tension is fine — only what the operator lists is reachable).
- **Match the FULL normalized base URL**, not just origin (L8) — `x-lucid-proxy-upstream` must exactly equal a
  listed base URL (trailing slash normalized); the server appends `/chat/completions` to the LISTED value, never
  to a client-controlled path.
- **`redirect: 'error'`** on the upstream fetch (H3) — the allow-list check is pre-fetch; a 3xx must NOT be
  auto-followed past it.
- **Auth-gated** (H4) — `/proxy` (GET + POST) behind the same bearer-when-token-set / open-when-token-free rule
  as `/sync`. **Exact registration (Gate-2 r2 M-B):** the `/sync` guard is `app.use('/sync/*', …)`, which matches
  `/proxy/<seg>` but NOT the **bare** `/proxy` — copying that shape would silently leave the relay ungated.
  Extract the token check into a reusable middleware fn and register it on the **exact bare path**:
  `app.use('/proxy', guard)` (Hono matches `/proxy` exactly). Routes stay bare `GET /proxy` + `POST /proxy`. The
  `tokenFree` boolean (`app.ts:115`) is reused inside the extracted guard.
- **Keys** (rule 65 §5) — the client `Authorization` (custom key) is forwarded to the allowed upstream ONLY;
  hop-by-hop + Host stripped; **never logged** (no request/header/body logging in the proxy path; DB untouched).

## Surface area (file-by-file)
### WI-1 (server · foundational · patch) — the proxy + capability + coverage gate
- **NEW `server/src/proxy.ts` (+ test)** — `parseAllowedUpstreams(env): string[]` (split/trim/normalize base
  URLs, drop blanks/invalid, http|https only) + `isAllowedUpstream(target, allowed): boolean` (exact normalized
  full-base-URL match). Pure.
- **`server/src/app.ts`** —
  - `GET /proxy` → `{ upstreams }` (the parsed allow-list). Auth-gated.
  - `POST /proxy` → read `x-lucid-proxy-upstream`; if empty allow-list OR target ∉ allow-list → `403` (no target
    echo); else `fetch(`${target}/chat/completions`, { method:'POST', body: c.req.raw.body, duplex:'half',
    headers: forward(content-type + client Authorization only), redirect:'error', signal: c.req.raw.signal })`
    and stream back `c.body(res.body, res.status, { 'content-type': res.headers.get('content-type') ?? … })`.
    Upstream fetch throw → `502`. Reuse the existing body cap. Auth-gated (same middleware as `/sync`).
- **`server/src/index.ts`** — parse `PROXY_ALLOWED_UPSTREAMS` into config; LOUD startup line listing the allowed
  upstreams when non-empty. Update `dev-docs/sync-server.md` (env table + a "LLM proxy" section).
- **Server coverage gate (Gate-2 r1 M6 + r2 M-C) — buildable spec:**
  (1) add **`@vitest/coverage-v8`** to `server/package.json` devDependencies (root has it; server doesn't →
  `--coverage` would fail to load the provider);
  (2) add a **`test:coverage`** script to `server/package.json` (`vitest run --coverage`);
  (3) `server/vitest.config.ts` gains a `coverage` block: `provider: 'v8'`, `include: ['src/**']`, a 100%
  threshold, and **`exclude`** the integration-only entry glue — `src/index.ts`'s `main()` + the
  `if (import.meta.url === entryUrl) main()` guard (they bind a socket; not unit-tested — mirror
  `vite.config.ts`'s `src/main.tsx`/`App.tsx` exclusion). Either exclude `src/index.ts` from the threshold or
  refactor its pure parts (`createServerConfig`, `parseAllowedUpstreams`) so only the integration glue is
  excluded — the SSRF-critical `proxy.ts` + the `/proxy` route logic MUST be gated;
  (4) **wire it into `check:all`** — add an explicit `cd server && pnpm test:coverage` step to the root
  `check:all` chain (`package.json`) so the server gate can't be skipped. Verify the server suite passes the
  threshold before this WI closes.

### WI-2 (client · foundational · patch) — proxy plumbing (no wiring yet)
- **NEW `src/lib/providers/proxyRoute.ts` (+ test)** — `shouldProxy({ singleOrigin, allowed, vendor, baseUrl })`
  where `singleOrigin` = `config?.serverUrl===location.origin && config.token===''` (token-FREE — M-A); true iff
  `singleOrigin` AND `vendor==='custom'` AND normalized `baseUrl ∈ allowed`. `proxyTarget(origin, baseUrl)` →
  `{ url: `${origin}/proxy`, upstreamHeader: baseUrl }`. **Normalize `baseUrl` with the SAME trailing-slash rule
  the server's `isAllowedUpstream` uses** (r2 L-d — a mismatch fails safe to direct). Pure, gated → 100%.
- **`src/providers/types.ts`** — `ProviderConfig` gains optional `proxy?: { origin: string; upstream: string }`.
  **`OpenAICompatibleDeps` (`openaiCompatibleProvider.ts`) also gains the `proxy?` field** (r2 L-b) — the adapter,
  not just the config, needs it.
- **`src/providers/index.ts` (`createProvider`) + `openaiCompatibleStream`** — when `config.proxy` is set, POST
  to `${proxy.origin}/proxy` with header `x-lucid-proxy-upstream: proxy.upstream` (server appends
  `/chat/completions`); else the current direct `chatCompletionsUrl(baseUrl)`. SSE parsing identical. **Test the
  `createProvider` proxy pass-through branch** (r2 L-c — `index.ts` is 100%-gated), not only `openaiCompatibleStream`.
- **A cached allow-list fetch**: on sync connect (single-origin), `GET /proxy` → cache `allowed` (a small store or
  the syncStore). Empty/failed → `allowed=[]` → everything direct.

### WI-3 (client · behavioral · FINAL · minor) — wire both call sites + privacy copy
- **`src/hooks/usePanelRun.ts` + `src/hooks/useTestConnection.ts`** — for a custom vendor, compute `shouldProxy`
  from the cached allow-list + `config.serverUrl===location.origin`; if true, pass `proxy:{origin,upstream}` into
  `createProvider`. Both sites (a run AND Test-connection) so they agree (Gate-2 r1 M7).
- **Privacy copy** (`src/locales/en/translation.json`) — when proxied, the "sent to X" note names the relay
  ("via this server"). Copy on the existing footer surface — not design-gated.

### Error mapping (Gate-2 r1 M5) — resolve the 403/503 contradiction
In the normal flow the client only proxies **allowed** targets, so `/proxy` returns the upstream's own status or
`502` on an upstream failure → maps to `providerDown`/`unreachable` (sensible). A `403` (disallowed target) is
DEFENSIVE-only (the client's allow-list check prevents sending it) — acceptable that it maps to `invalidKey`
since it's never hit in the normal path. No new user-facing error state → **still not rule-51 design-gated**.

### Files OUT of scope
- Hosted-vendor paths (unchanged, direct). `/sync` + `/config` + their auth (unchanged; the proxy reuses the
  `tokenFree` predicate). No TLS in-app. No UI toggle/indicator (transparent).

## Work items
- **WI-1** (server · foundational) — `/proxy` (GET capability + POST relay, auth-gated, allow-list, redirect:error,
  streaming signal+duplex, 502) + `parseAllowedUpstreams`/`isAllowedUpstream` + env + startup log + **server
  coverage gate wired into `check:all`**.
- **WI-2** (client · foundational) — `proxyRoute.ts` + `ProviderConfig.proxy` + `createProvider`/`openaiCompatibleStream`
  proxy branch + the cached allow-list fetch.
- **WI-3** (client · behavioral · FINAL) — wire `usePanelRun` + `useTestConnection` + privacy copy + end-to-end.

## Test catalogue
- `proxy.ts` (server) — `parseAllowedUpstreams` (split/trim/normalize/drop-invalid/empty); `isAllowedUpstream`
  (exact full-base-URL match; path/host/scheme mismatch → false; trailing-slash normalized; empty → false).
- `app.ts` (server) — `GET /proxy` returns the allow-list (auth-gated: 401 without token in token-set quadrant,
  open token-free); `POST /proxy` allowed target streams the mocked upstream body back; not-allowed → 403;
  **`redirect:'error'` — a 3xx upstream → error, not followed** (SSRF negative test); upstream throw → 502;
  body-cap enforced; the Authorization header is forwarded but never logged.
- `proxyRoute.ts` (client) — `shouldProxy` (single-origin+custom+listed → true; built-in/unlisted/not-single-origin
  → false); `proxyTarget` builds the URL + header.
- `openaiCompatibleStream` — with `config.proxy` → POST `${origin}/proxy` + the upstream header; without → the
  direct `chatCompletionsUrl` (unchanged); SSE identical.
- `usePanelRun` + `useTestConnection` — a listed custom provider single-origin → both inject `proxy`; an unlisted
  one → both direct.

## Risks + mitigations
- **No-regression (H2)** — direct-by-default; proxy only for listed custom providers when single-origin; empty
  env → today's behavior exactly. A slice test proves a direct-working custom provider (unlisted) still goes direct.
- **SSRF (H3/L8)** — env allow-list (operator-named), full-base-URL match, `redirect:'error'`, no target echo.
- **Open relay (H4)** — `/proxy` auth-gated (bearer when token-set; open only token-free).
- **Streaming** — `res.body` passthrough (SSE token-by-token; confirmed), `signal: c.req.raw.signal` (abort),
  `duplex:'half'` (Node fetch streamed body). No buffering middleware.
- **Keys (rule 65 §5)** — Authorization relayed only, never logged/stored; keys stay in-memory client-side.
- **Coverage (M6)** — server coverage threshold + wired into `check:all` so `proxy.ts` is gated.

## Backward compat
Purely additive: no env → `/proxy` 403 + `GET /proxy` empty → client all-direct (today's behavior). Existing
hosted + local-direct flows unchanged. Older clients ignore `/proxy`.

## Audit fixes applied (Gate 2, round 1 → v2)
r1 = 4 High + 4 Med. **H1** predicate → `config?.serverUrl===location.origin`. **H2** capability model,
direct-by-default (no forced proxy / no regression / no 403-on-upgrade). **H3** `redirect:'error'`. **H4** `/proxy`
auth-gated (reuse `tokenFree`). **M5** normal flow proxies only allowed targets → 502→providerDown; 403 defensive
only; no new error state. **M6** server coverage threshold wired into `check:all`. **M7** real symbols
(`openaiCompatibleStream`/`createProvider`/`ProviderConfig`) + both call sites (`usePanelRun`+`useTestConnection`).
**L8** full-base-URL match + trailing-slash normalize. **L9** predicate on config-presence; sync-off → direct
(noted). **L10** WI-1 slice verify against a real local upstream + redirect + unauth negative tests. Streaming
details `signal`+`duplex` added.

## Audit fixes applied (Gate 2, round 2 → v3)
r2 = 3 Med + 4 Low (all r1 High closed). **M-A** predicate scoped to token-FREE single-origin
(`config.token===''`) — resolves the Authorization collision; token-set single-origin → direct (documented).
**M-B** `/proxy` auth pinned to the exact bare path (`app.use('/proxy', guard)`, not `/proxy/*`) via an extracted
guard fn — closes the silent open-relay. **M-C** server coverage made buildable: add `@vitest/coverage-v8` dep +
`test:coverage` script + a `coverage` block excluding `index.ts`'s integration-only `main()`/entry-guard, wired
into `check:all`. **Lows:** L-a cache-staleness window noted (allow-list refetched only on connect → a stale
now-removed target can hit a real 403/invalidKey until reconnect — acceptable, documented); L-b
`OpenAICompatibleDeps.proxy?`; L-c test the `createProvider` proxy branch; L-d client/server normalization parity.

## Revision history
- v1 (2026-07-06) — initial draft.
- v2 (2026-07-06) — Gate-2 round-1 fixes (4 High + 4 Med). Capability/direct-by-default redesign.
- v3 (2026-07-06) — Gate-2 round-2 fixes (3 Med + 4 Low). **Gate-2 PASSED** — 0 open Crit/High/Med; the round-2
  Mediums closed by the token-free scoping (M-A), the exact `/proxy` auth registration (M-B), and the buildable
  server-coverage spec (M-C), each per the auditor's prescribed fix.

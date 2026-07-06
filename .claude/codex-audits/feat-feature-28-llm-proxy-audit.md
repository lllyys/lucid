---
branch: feat/feature-28-llm-proxy
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-07-06
---

# Gate-4 audit — feature #28 (same-origin LLM proxy in @lucid/server)

Independent Claude auditor (read-only, diff-scoped, three-dot 1810 lines). **ship-as-is, 0 open
Critical/High/Medium.** The deeper fix for bug #10 — the browser calls a same-origin relay; the server does the
CORS-less / private-IP / mixed-content fetch.

## Verified (decisive)
- **SSRF model** (`server/src/proxy.ts` + `POST /proxy`): the upstream is matched by **full normalized base URL**
  (not just origin — an unlisted path/host/scheme on a listed origin → 403); **`redirect:'error'`** (no 3xx hop
  past the pre-fetch check → 502); empty/absent `PROXY_ALLOWED_UPSTREAMS` → **403 default-disabled** (no open
  relay); the server appends a **fixed `/chat/completions`** to the LISTED value (client can't inject a path);
  `http|https` only; **no target/body echo** (`{error:'forbidden upstream'}` / `{error:'upstream unreachable'}`).
- **Bare-path auth (H4)**: `app.use('/proxy', guard)` — the exact bare path (not `/proxy/*`, which would miss
  it), reusing the `/sync` `tokenFree` guard; both GET + POST gated; token-set quadrant → 401.
- **Keys (rule 65 §5)**: only `content-type` + the client `Authorization` forwarded (hop-by-hop + Host stripped);
  **zero logging** of the header/body in the proxy path; the DB is untouched by the relay.
- **Direct-by-default / no regression (H2)**: the client proxies ONLY token-free single-origin
  (`config?.serverUrl===location.origin && config.token===''`) + custom + base URL ∈ the cached allow-list; every
  other case → the existing direct path unchanged (empty env / unlisted / built-in / token-set → direct). The
  allow-list cache defaults `[]` on any failure.
- **Streaming (rule 65 §3)**: proxied requests POST `${origin}/proxy` + `x-lucid-proxy-upstream`; the server
  pipes `res.body` back with `signal: c.req.raw.signal` + `duplex:'half'` un-buffered; SSE parsing identical.
- **Both call sites agree**: `usePanelRun` + `useTestConnection` + `FooterPrivacy` share `resolveProxyConfig`.
- **Coverage deviation (accepted)**: `proxy.ts` + the `/proxy` route in `app.ts` are 100%-gated (wired into
  `check:all` via `pnpm --filter @lucid/server test:coverage`); the exclusions are pre-existing/integration glue
  only (`db.ts` corrupt-row guards, `index.ts` socket-bind, `types.ts`). The `parseSince` dead-branch removal is
  genuinely unreachable (the digit regex guarantees `n>=0`) — not a behavior change.

## Findings (2 Low — non-blocking)
- **L1 (APPLIED)**: the relay dropped `Retry-After` on a proxied 429 → the client lost the server-directed
  backoff (rule 65 §4 parity). Fixed: forward `retry-after` in the relay response headers, + a test (a proxied
  429 forwards `retry-after: 30`).
- **L2 (ACCEPTED)**: `FooterPrivacy` reads the allow-list non-reactively → a transient footer flash that
  self-heals and errs safe (under-claims the relay). The plan already logged cache-staleness (L-a) as accepted; a
  store-backed allow-list is a follow-up, not a blocker.

## Gate
`pnpm check:all`: lint + typecheck + 100% root gated coverage + **100% server coverage on proxy.ts + the route** +
build — green with #11 merged in. Version 0.24.0.

## Verdict
ship-as-is (L1 applied, L2 accepted).

---
title: Proxy security model
updated: 2026-07-06
status: verified
---

# Proxy security model

The same-origin proxy is SSRF-bounded. The upstream target (`x-lucid-proxy-upstream`) is matched against an
operator env allow-list (`PROXY_ALLOWED_UPSTREAMS`) by **full normalized base URL**, not just origin — an
unlisted path/host/scheme on a listed origin is rejected. `redirect: 'error'` on the upstream fetch blocks a
3xx hop past the pre-fetch check. An empty allow-list yields **403 default-disabled** (no open relay). `/proxy`
(GET + POST) is auth-gated on the **exact bare path** (`app.use('/proxy', guard)`, never `/proxy/*`, which
would miss it), reusing the `/sync` token-free predicate. The client key is forwarded to the allowed upstream
only (hop-by-hop + Host stripped) and **never logged**. The server appends a fixed `/chat/completions` to the
LISTED base, so the client can't inject a path. See [[Same-origin LLM proxy]].

**Verified.** `server/src/app.ts` contains `redirect: 'error'` and `app.use('/proxy'`; the allow-list match
(`isAllowedUpstream` / full-URL normalize) is in `server/src/proxy.ts` — checked 2026-07-06.

**Sources.** [[session b7bfaa95-1d39-4240-bd4a-2e9eb028a55a · 2026-07-06]]

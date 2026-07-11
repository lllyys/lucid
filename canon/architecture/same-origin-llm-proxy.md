---
title: Same-origin LLM proxy
updated: 2026-07-06
status: verified
---

# Same-origin LLM proxy

`@lucid/server` relays a browser LLM request to a custom/local upstream **server-side**, so the browser
call is same-origin — the deeper fix for a browser that can't reach a CORS-less / mixed-content /
private-IP endpoint directly. Routing is **capability / direct-by-default**: the server advertises its env
allow-list via `GET /proxy`, and the client proxies ONLY a **token-free single-origin** custom provider
whose base URL is in that allow-list (`config.serverUrl === location.origin && token === ''`). Every other
request — built-in vendor, unlisted base URL, empty allow-list, token-set, non-single-origin — stays on the
existing direct path (zero regression). Shipped v0.24.0. See [[Proxy security model]] and
[[Server deployment and DB path]].

**Verified.** `server/src/proxy.ts` and `server/src/app.ts` (the `GET`/`POST /proxy` routes) present on 2026-07-06.

**Sources.** [[session b7bfaa95-1d39-4240-bd4a-2e9eb028a55a · 2026-07-06]]

---
title: Server coverage gate
updated: 2026-07-06
status: verified
---

# Server coverage gate

The SSRF-critical server surface (`server/src/proxy.ts` + the `/proxy` route in `server/src/app.ts`) is
100%-coverage-gated and wired into the root `check:all` via `pnpm --filter @lucid/server test:coverage`.
Pre-existing integration glue (`server/src/db.ts` corrupt-row guards, `server/src/index.ts` socket bind) is
excluded from the threshold. This extends the root 100% gate (`src/lib/**`, `src/stores/**`, `src/providers/**`)
to the server package's highest-risk code, so the proxy relay can't ship un-gated. See [[Proxy security model]].

**Verified.** `package.json` `check:all` invokes `--filter @lucid/server test:coverage`; `server/vitest.config.ts`
present on 2026-07-06.

**Sources.** [[session b7bfaa95-1d39-4240-bd4a-2e9eb028a55a · 2026-07-06]]

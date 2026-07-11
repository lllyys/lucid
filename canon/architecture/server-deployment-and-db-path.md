---
title: Server deployment and DB path
updated: 2026-07-06
status: verified
---

# Server deployment and DB path

`@lucid/server` persists BOTH workspace-data sync AND the E2E-encrypted config-sync blob in **one SQLite
database** — tables `entities` and `config` (the config is a single row, `id = 1`). Deployment discipline
follows directly: the production server (`:8787`, token-free single-origin, detached) MUST pin one durable
path (`~/.lucid-sync/sync.db`); a diverging `DB_PATH` across redeploys silently strands data. On 2026-07-06 the
config blob (rev 13, the user's encrypted keys) was found stranded in an older `~/.lucid/config.db` while the
running server read `~/.lucid-sync/sync.db` (177 workspace entities, no config row) — the app showed "No synced
config yet". Recovered by a DB-to-DB `config`-row migration (backup first, rev preserved). See
[[Same-origin LLM proxy]] (the same server also runs the proxy).

**Verified.** `server/src/db.ts` defines `CREATE TABLE IF NOT EXISTS entities` and `CREATE TABLE IF NOT EXISTS config`
on 2026-07-06.

**Sources.** [[session b7bfaa95-1d39-4240-bd4a-2e9eb028a55a · 2026-07-06]]

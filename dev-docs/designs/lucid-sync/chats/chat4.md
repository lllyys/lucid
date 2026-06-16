# Shared link

_Started 2026-06-16 15:32 UTC_

---

## User

https://github.com/lllyys/lucid/issues/53

## Assistant

_[tool: read_file]_

_[tool: web_fetch]_

_[tool: read_file]_

_[tool: web_fetch]_

Now let me understand the existing Lucid design and the repo's design conventions. Let me explore both.

_[tool: github_get_tree]_

_[tool: grep]_

_[tool: web_fetch]_

_[tool: github_read_file]_

_[tool: read_file]_

This is the WI-9 design bundle for Lucid's self-hosted sync. I have full context: the plan (per-entity LWW + surfaced conflict signal, persisted token, opt-in/local-first), the exact design tokens, and the established Settings/modal patterns from the workspace. I'll build a committed design board covering every surface and state in Lucid's visual language.

_[tool: update_todos]_

Now building the design board.

_[tool: dc_write]_

_[tool: show_html]_

_[tool: update_todos]_

Design bundle for issue #53 (WI-9) is ready — a single review board in Lucid's exact tokens (light + dark) covering every surface and state the issue calls out:

- **A** — Sync status pill, all 8 states (local-only → synced → syncing → offline-queued → conflict → auth-error → unreachable → rate-limited)
- **B** — Connect server (not-connected): URL + bearer token, opt-in callout, "what leaves this device" data-scope (keys never), persisted-token/TLS note, plus the connecting state
- **C** — Connected/idle: synced + last-synced, server/token row, data scope, two-way disconnect zone
- **D** — Status card swapped per live state (syncing/offline/conflict/auth/unreachable)
- **E** — Conflict-occurred surface (superseded-edit signal; review UI noted as deferred) + disconnect choice dialog (plain vs erase-server-data)
- **F** — Inline error banners mapped to `syncUnreachable` / `syncAuth` / `syncConflict` / rate-limit

Copy reflects the plan's commitments: local-first, data-only, per-entity LWW with a surfaced conflict signal, server-`rev` ordering. Tweakable `theme` and `accent` props are wired.

_[tool: ready_for_verification]_

Done. The board renders cleanly and is open in your preview. If you want, I can also wire this into the actual workspace file (a "Sync" rail in Settings + the header status pill) the way #29 was integrated, or export the bundle for committing to `dev-docs/designs`.


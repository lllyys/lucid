# Lucid Settings·Sync Simplified — design bundle (feature #19, WI-3)

Committed handoff from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-22 to unblock the
design-gated WI-3 of feature #19 (GH #147) — the simplified Settings·Sync UI. Resolves needs-design #151.

## What it depicts

The Settings·Sync surface collapsed for the **token-free single-origin** sync model (whose headless logic
shipped in v0.14.1): the config goes from "server URL + bearer token fields" to an **on/off toggle** for
"sync workspace data to this server", with the manual URL/token kept behind an advanced affordance for the
remote/cross-origin case. Plus the pill states and any connect/disconnect/error surfaces at the simplified
layout.

## Status
The #19 headless layer (server token-free `/sync` mode + client `connectSingleOrigin`) is shipped + audited
+ live-verified (v0.14.1). This bundle covers ONLY the remaining rendering layer (WI-3). Full spec is
distilled at implementation time.

## Notes
- `project/...dc.html` is the depiction; `project/support.js` is the shared framework.
- Reuses the workspace palette (light + dark).
- Refs #147 (feature #19), #151 (this design request).

# Lucid Sync-consent Prompt — design bundle (feature #21)

Committed handoff from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-28 to unblock the
design-gated UI of feature #21 (GH #175) — the first-run sync-consent prompt (WI-3). Resolves needs-design #177.

## What it depicts

The **first-run sync-consent prompt** — a modal (bottom-sheet on phone) shown the first time Lucid detects a
reachable **same-origin, token-free** sync server and the user hasn't yet decided. It asks **proactively** so
existing local sessions are never silently uploaded (rule 65 §6). Header: *"Sync server detected — Lucid found
your server. Sync to it?"*; the server address is shown; a **"What would sync"** list reuses the #19 scope
verbatim (Sessions & task history · Glossary terms · Polish keywords · **API keys — never**); a footnote makes
clear the data goes to *your own server*, never to Lucid or a third party. **Two explicit outcomes only:**
**Sync to my server** (connect & remember) and **Keep local-only** (stay local, never re-ask) — no quiet
dismiss. **Esc = Keep local-only** (the safe default); focus opens on **Keep local-only**, not the primary, so
uploading is never one stray Enter away.

States depicted: **prompt** (default) · **accepting / connecting** ("Connecting to your server… → Reached
server → Uploading your local sessions…") · **declined** (dismissed) · **light + dark** · **responsive**
(modal on desktop, bottom-sheet on phone) · **RTL**.

## Status
The #21 headless logic (the `backend.pull(0)` eligibility probe, the persisted `autoSyncPrompt` state, and
`maybeAutoConnect`/`acceptAutoSync`/`declineAutoSync` in the sync controller — consent-gated, no silent
connect) shipped v0.17.1 (WI-1/WI-2). This bundle covers the rendering layer (the consent prompt + its states)
and the load-path wiring (`maybeAutoConnect` into the `Workspace` effect) — WI-3.

## Notes
- `project/...dc.html` is the depiction; `project/support.js` is the shared framework.
- Reuses the workspace palette (light + dark) — map design tokens to the codebase (`--ink`→`--text-color`,
  `--surface`→`--bg-color`, `--accent`→`--accent-primary`, `--ok`→success tokens, `--shadow-c*`→`--shadow-*`).
- This is **consent, not the Settings connect form (#19)** — no URL or token field; the eligibility probe has
  already confirmed same-origin / reachable / token-free.
- Refs #175 (feature #21), #177 (this design request); builds on the #19 sync surfaces.

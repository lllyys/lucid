# Lucid Passphrase & Unlock — design bundle (feature #15, WI-6)

Committed handoff bundle from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-20 to unblock
feature #15's only design-gated surface (rule 51; needs-design issue #120).

## What it depicts

The one visible surface for cross-device E2E-encrypted config sync — the passphrase / unlock layer
that the headless WI-1–5 (crypto, codec, server `/config`, client sync) feed into.

| Section | Surface / state |
|---|---|
| **A** | **Unlock** (returning device) — the unlock card shown over a dimmed, not-yet-hydrated workspace: passphrase input + Show, "Unlock & load workspace", "Forgot passphrase?", "ciphertext only on server" note. |
| **B** | **Set passphrase** (first use) — passphrase + strength meter + confirm (✓), the **no-recovery** warning, "Encrypt & enable sync" / "Not now", and the privacy-model side panel (passphrase in memory · config encrypted on device · server sees ciphertext only). |
| **C** | **Unlock error states** — the same card swaps an inline status: `wrong-passphrase-or-corrupt`, `unreachable` (auto-retry + Work local-only), `request-failed` (500). |
| **D** | **Blocking & empty** — `insecure-context` (HTTPS required — blocks the passphrase; `crypto.subtle` unavailable on http://; tailscale-serve hint) and `no-config-yet` (clean first run). |
| **E** | **Inline error banners** — the four localized `error.*` strings, non-blocking, in Settings · Sync. |

## Localized error keys (named in the design)

`error.insecureContext` · `error.wrongPassphraseOrCorrupt` · `error.configUnreachable` · `error.configRequestFailed`

## Notes
- `project/Lucid Passphrase & Unlock (feature 15).dc.html` is the depiction; `project/support.js` is the
  shared design-canvas framework (identical to the other lucid bundles).
- Tokens match the workspace (light + dark). Accent `#574FD6`.
- Refs #111 (feature), #120 (this design request), rule 65 §6 (no recovery; ciphertext-only server).

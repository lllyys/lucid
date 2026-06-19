# Design bundle — Multiple custom providers (feature #10)

Handoff bundle from Claude Design (claude.ai/design), imported via the design MCP on 2026-06-19 to
unblock feature #10 (was `needs-design`, GH #109). Source file `Lucid Custom Providers (feature 10).dc.html`.
This is the committed design that satisfies rule 51 for the custom-providers surfaces. Implement to match
its visual output in React + Tailwind + shadcn; do not copy the prototype's internal structure.

## What it specifies

Turn the **single** custom-provider slot into **many** OpenAI-compatible endpoints, each with its own
**label · base URL · model · optional key**. Keys stay in memory for the session (rule 65 §5).

- **A — Settings rail** (`SettingsDialog`): built-in vendors above, a **Custom providers** group below that
  holds N (empty state with a "+ Add custom provider" CTA; populated state with a `Custom · N` count). Each
  row keeps the existing anatomy (status dot · label · status·model); the active provider is marked **In
  use** (independent of which row is selected for editing).
- **B — Add / edit form** (detail pane): Label, Base URL, Model, optional API key (with Show toggle + an
  in-memory-only note). **Validation**: duplicate label → error; base URL without a scheme → error. Add/Save
  disabled until label is unique + URL parses; **Test connection** allowed once the URL is valid.
- **C — Per-custom connection test** (the connection card): states untested / testing… (spinner, cancel) /
  connected (latency · models · model-resolved) / needs-key (401) / unreachable (DNS/CORS).
- **D — Remove** (confirm dialog): forgets endpoint/model/in-memory-key; if it's the **active** provider,
  the workspace falls back to a built-in (OpenAI) with a notice; removing a non-active custom is a quiet
  one-step delete. Edit is inline; only Remove is gated behind a confirm.
- **E — Toolbar switcher** (`ProviderSwitcher` dropdown): groups Built-in + a scrollable **Custom** list
  (with count); status dots carry through; the collapsed trigger carries a status chip when the active
  custom isn't ready; an "Add custom provider…" item at the bottom.

Tokens match the workspace bundle (light + dark). refs #92.

## Contents
- `README.md` — this file
- `project/Lucid Custom Providers (feature 10).dc.html` — the design (read it in full)
- `project/support.js` — the Claude Design render harness (shared across the project's bundles)

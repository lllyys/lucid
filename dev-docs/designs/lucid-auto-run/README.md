# Design bundle — Auto-run after typing (feature #11)

Handoff bundle from Claude Design (claude.ai/design), imported via the design MCP on 2026-06-19 to
unblock feature #11 (was `needs-design`, GH #108). Source file `Lucid Auto-run (feature 11).dc.html`.
This is the committed design that satisfies rule 51 for the auto-run surfaces. Implement to match its
visual output in React + Tailwind; do not copy the prototype's internal structure.

## What it specifies

An **opt-in** control that re-runs Translate / Polish after the input settles (debounced), reusing the
existing run pipeline. **Off by default** so hosted providers never fire surprise paid calls per keystroke
(rule 65). Pending / auto-running states are visually distinct from manual streaming.

- **A — The toggle**: lives in the panel header beside Run; off (manual, today) vs on (armed — the primary
  button steps back to a quiet **Run now**). Persists per workspace. **First-enable cost gate**: enabling
  on a *hosted* provider shows a one-time confirm ("Auto-run uses a paid provider"); local providers
  (Ollama / LM Studio) skip it.
- **B — Debounce-pending indicator**: a chip with a **countdown ring** ("Auto-run in 1.5s / 0.5s"),
  cancellable; a keystroke resets it; also shown compactly in the source footer. Distinct from streaming.
- **C — Auto-running vs manual streaming**: identical streaming chrome (same pulsing dot, Stop) — auto
  adds a quiet **AUTO** tag so a glance answers "did I trigger this, or did it?".
- **D — Provider-not-ready → suppressed**: when there's no key / no endpoint, the toggle is **disabled
  with a reason** ("Add a key… Open Settings"); if it was on and the provider goes unready, an **Auto-run
  paused** warning (text + toggle kept; "Fix"). Nothing ever fires silently.
- **E — Manual Run while auto is on**: **Run now** is always available; pressing it (or ⌘↵)
  short-circuits the countdown — fires immediately and clears the pending timer.
- **F — CJK / IME composition**: never fires mid-compose; the debounce is **held** during an open
  composition (underlined preedit) and only starts from full duration once the composition commits.

Default debounce ≈ 1.5s. Tokens match the workspace bundle (light + dark). refs #94.

## Contents
- `README.md` — this file
- `project/Lucid Auto-run (feature 11).dc.html` — the design (read it in full)
- `project/support.js` — the Claude Design render harness (shared across the project's bundles)

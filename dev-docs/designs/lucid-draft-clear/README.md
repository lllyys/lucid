# Design bundle — Clear button on the DRAFT-to-polish header (feature #27 / issue #226)

Handoff bundle from Claude Design (claude.ai/design), imported via the design MCP on 2026-07-09 to
unblock feature #27 (was `needs-design`, GH #225 · design request #226). Source project: `lucid`
(claude.ai/design), file `Lucid Draft Clear (issue 226).dc.html`.

This is the committed design that satisfies rule 51 for the DRAFT-header Clear surface. Implement to
match its **visual output** in React + Tailwind; do not copy the prototype's inline-style structure.

## What it specifies

Add a **Clear** button to the polish **DRAFT TO POLISH** card header (`DraftCard`) — the same control
feature #23 added to the **Original** card, now on the busier Draft header. It completes Clear parity
across both polish inputs.

- **Placement** — first in the DraftCard header's right-side control group, **before** Translate
  original / LookupToggle (⌕) / LanguagePicker. Same first slot as the #23 Clear on the Original card,
  so both polish cards read identically.
- **Appearance** — identical to #23: borderless text button, Geist 12px, resting `--text-tertiary` →
  hover `--text-color`, focus-visible ring `--accent-ink`. Quiet text style, visually subordinate to the
  bordered "Translate original".
- **Visibility** — shown only when `value.trim()` is non-empty **AND** `!translating`. While the draft
  streams (the `draftTranslate` op mirrors into it), the stream owns the field — **Stop** is the only
  exit (matches the lookup toggle disabling during streaming). This `!translating` guard is the one
  difference from the Original Clear (the Original is never a streaming target).
- **Behavior** — wipes the draft, resets the dependent polish op **without arming a re-polish** (mirror
  #23's non-arming `clearOriginal` — no debounced LLM call under auto-run), then refocuses the draft
  textarea.
- **Copy** — reuse the existing i18n key `polish.clear` from #23. Localized + mirrored under RTL.
- **Phone** — the header wraps to two rows: label + Clear on row one (Clear gets a ≥44px vertical hit
  area via padding), Translate original + ⌕ + language picker on row two.

## States in the `.dc.html` (8)

default (draft present → Clear shown, leading the group) · empty (Clear hidden, lookup disabled) ·
hover (→ `--ink`) · keyboard focus (`--accent-ink` ring) · translating (Clear hidden, Stop is the exit) ·
dark · RTL (header mirrors, Clear still leads) · phone portrait (two-row header, ≥44px hit area).

## Contents

- `README.md` — this file
- `project/Lucid Draft Clear (issue 226).dc.html` — the design (read it in full)
- `project/support.js` — the Claude Design render harness (shared across the project's bundles)

Parity with `dev-docs/designs/lucid-polish-clear/` (feature #23, the Original Clear). Refs #225 · #226 · #23.

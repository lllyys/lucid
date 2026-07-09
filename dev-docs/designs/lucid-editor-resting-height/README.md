# Design bundle — Tighter editor resting height (feature #26 / issue #219)

Handoff bundle from Claude Design (claude.ai/design), imported via the design MCP on 2026-07-09 to
unblock feature #26 (was `needs-design`, GH #218 · design request #219). Source project: `lucid`
(claude.ai/design), file `Lucid Editor Resting Height (issue 219).dc.html`.

This is the committed design that satisfies rule 51 for the editor resting-height change. Implement to
match its **visual output** in React + Tailwind; do not copy the prototype's inline-style structure.

## Direction resolved by this design

The tracker note for #26 had drifted toward a "fixed-height, no-grow" reading. **This committed design
supersedes that**: it keeps the #13 grow-to-content model and only lowers the resting minimum. Section B
is a growth ladder — the editor still grows one line at a time and still caps at ~88vh. The committed
design is authoritative (rule 51), so the implementation follows **tighter resting height, grow-to-content
retained**.

## What it specifies

Lower the resting minimum of the three auto-expanding editors (feature #13) so short/one-line content
hugs tight instead of floating over ~33px of dead space:

- **Textarea resting min `88px` → `56px`** — one 18px × 1.7 text line (≈31px) + the existing top/bottom
  padding. Empty and one-line rest at the **same** height (no jump on the first keystroke).
- **Polish card min `130px` → `98px`** — header (≈42px) + the 56px field. Applies to the two polish
  cards (Original, Draft); the translate Source is a flex section with no card minimum, so only its
  textarea min changes.
- **Growth unchanged** — `field-sizing: content`, +≈31px per wrapped line, cap `max-h-[88vh]` (phone
  keeps its tier-scoped `50vh` cap from #16); only at the cap does the inner scrollbar return.
- **One shared constant for the resting min across all three editors** — do not fork the 56px value
  per editor (design's explicit architectural instruction).
- **No other changes** — header, padding, typography, the cap, and RTL/`dir` handling are untouched.
  This bundle supersedes **only** the resting-height values of the #13 bundle.

## Sections in the `.dc.html`

A — resting height before/after (88px → 56px) · B — growth ladder (empty → 1-line → 3-line → cap) ·
C — one rule for all three editors (Source / Original / Draft) · D — dark / RTL / phone. A closing
implementation-spec note restates the exact Tailwind values.

## Contents

- `README.md` — this file
- `project/Lucid Editor Resting Height (issue 219).dc.html` — the design (read it in full)
- `project/support.js` — the Claude Design render harness (shared across the project's bundles)

Supersedes the resting-height portion of `dev-docs/designs/lucid-auto-expanding-editors/` (feature #13).
Refs #218 · #219 · #97 (#13).

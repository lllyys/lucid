# Design bundle — Auto-expanding editor panes (feature #13)

Handoff bundle from Claude Design (claude.ai/design), imported via the design MCP on 2026-06-19 to
unblock feature #13 (was `needs-design`, GH #109). Source project: `lucid` (claude.ai/design),
file `Lucid Auto-expanding Editors (feature 13).dc.html`.

This is the committed design that satisfies rule 51 for the editor-sizing surface. Implement to match
its **visual output** in React + Tailwind; do not copy the prototype's internal structure.

## What it specifies

The editors change sizing model — from the committed **fixed flex-share + inner scroll** to
**grow-to-content**:

- **Grow to content** — an editor's card height equals its content height; no inner scrollbar in the
  normal case. The whole draft is visible at once.
- **Resting min-height ≈ 130px** — an empty editor rests at a minimum (inner text area ~84px + header).
- **Max-height cap ≈ 88vh** — growth is bounded so one editor can't push the panel offscreen; only at the
  cap does the inner scrollbar reappear (with a top fade signalling content above). This is the one place
  the old inner-scroll model survives.
- **Column reflow** — in the polish view, Original + Draft grow independently and the **panel column**
  scrolls; sibling cards keep their content height (they don't shrink), and the fixed cards (e.g. Domain
  keywords) stay reachable at the bottom. The column owns the scroll, not the cards.
- **Script-aware height** — measured height respects per-script line-height (CJK denser, Arabic taller);
  RTL grows right-anchored with the caret on the right edge; latin runs stay LTR inside an RTL block.
- **Shared measured height** — the textarea and its visual card share one measured height so the caret
  never hides behind a fold while typing.
- Tokens match the workspace bundle (light + dark). refs #97.

## Sections in the `.dc.html`

A — the sizing change (before/after) · B — growth ladder (empty → 4 → 9 lines) · C — max-height cap
(inner scroll returns) · D — polish column reflow · E — CJK / RTL / mixed-script.

## Contents

- `README.md` — this file
- `project/Lucid Auto-expanding Editors (feature 13).dc.html` — the design (read it in full)
- `project/support.js` — the Claude Design render harness (shared across the project's bundles)

# Lucid Responsive · Mobile Layout — design bundle (feature #16, resolves #17)

Committed handoff from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-22 to unblock
feature #16 (responsive/mobile layout, GH #138) and the design dependency of feature #17 (scroll model,
GH #143). Resolves needs-design #140.

## What it depicts

The workspace reflowed for narrow viewports — 8 phone frames (390×812) + 3 layout schematics +
component-reflow detail.

### Breakpoints (three tiers)
| Tier | Width | Layout |
|---|---|---|
| Desktop | **≥ 960px** | unchanged — inline sidebar (268px) + the two stacked panels |
| Tablet | **600–959px** | sidebar → off-canvas drawer; editor columns drop to a single stacked column |
| Phone | **< 600px** | sidebar → drawer; **single-pane Translate/Polish segmented switcher** |

(Custom breakpoints 600/960 — NOT Tailwind defaults.)

### Surfaces / states (by on-canvas label)
- **A** — layout schematics: `≥960 desktop (today)` · `600–959 tablet` · `<600 phone`.
- **B** — Translate phone: `source typed` · `streaming` (Stop button, elapsed footer).
- **C** — Polish phone: `inputs (scroll top)` · `result + compare (diff)` (sticky Result/Compare + hunk bar + pinned accept bar).
- **D** — Sidebar `drawer · open` (312px over a 42% scrim, brand+× header, Settings footer) · `drawer · closed`.
- **E** — header (50px: ☰ left · centered brand · gear right; tagline + run-hint dropped) · footer (truncate + "Details" CTA) · translate toolbar (lang pill + swap + Run; DirectionOverride folds into the lang menu).
- **F** — mobile gates/banners: `unlock gate · full-screen` · `sync pill (fits 50px header)` (Synced/Local-only/Syncing) · `unlock banner (stacked, full-width)`.

### Scroll model (the #17 decision)
The design **keeps the app-shell + inner-scroll model** at every tier — header/switcher/toolbar/footer are
pinned (`flex:0 0 auto`); the editor/content column is the single scroll region (`flex:1; overflow`). It
does NOT switch to whole-page (`document`) scroll. The user's "scroll the whole interface" request is met
on mobile by the **single content column scrolling as one** (not per-card), with chrome pinned so the Run
button stays thumb-reachable. Feature #13's grow-to-content editors (`field-sizing-content` + `max-h-88vh`)
are preserved (the 88vh cap is re-validated on phone).

## Tokens
Reuses the workspace palette (light + dark) — maps ~1:1 to `src/index.css` (`--canvas`→`--bg-canvas`,
`--ink`→`--text-color`, `--accent`→`--accent-primary`, etc.). No new token system; `--accent-mid` (chip
glyph) reuses `--accent-ink`.

## Notes
- `project/...dc.html` is the depiction; `project/support.js` is the shared design-canvas framework
  (identical across the lucid bundles).
- One undepicted gap flagged in the plan: the **ProviderSwitcher's mobile placement** (resolved in the
  plan as hide-on-phone, reachable via Settings — not a new surface).
- Refs #138 (feature #16), #143 (feature #17), #140 (this design request).

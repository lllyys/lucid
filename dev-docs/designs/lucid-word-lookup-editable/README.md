# Lucid Word-lookup Editable Overlay — design bundle (feature #169)

Committed handoff from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-28 to unblock the
design-gated UI of feature #169 (GH #169) — word-lookup inside the **editable** Original / Draft panes and the
translate source. Resolves needs-design #173.

`project/...dc.html` is the committed depiction (board header + framework); this README is the **implementable
distillation of the full board** (the spec the build follows). The result popover is **#20, reused verbatim** —
this feature owns only the *trigger* + the *overlay*, never a new result UI.

## The problem
The Original / Draft panes (and the translate source) are `<textarea>`s — raw text with a caret, no per-word
DOM nodes — so the shipped #20 word-lookup (which needs clickable word spans) can't reach them. This bundle
specifies a **mirrored click-overlay** + a **lookup-vs-edit trigger** that makes words clickable *without*
breaking editing.

## Section A — The overlay (a mirrored click layer over the textarea)
1. **Mirror, don't replace.** A rendered, segmented copy of the textarea's text sits *above* it — identical
   font, size, line-height, padding, wrapping. The real `<textarea>` stays underneath, fully editable.
2. **Scroll-synced.** The overlay tracks the textarea's `scrollTop` 1:1 — a word stays glued to its glyphs as
   the field scrolls.
3. **Word spans = hit targets.** #20's segmentation splits the text into clickable spans; the **gaps between
   words fall through** to the textarea so a click there still lands the caret.
4. **Result is #20, verbatim.** A clicked span opens the existing word-lookup popover anchored to it — no new
   result surface.
- The overlay is `pointer-events:none` by default; **only word spans re-enable pointer events**, and only when
  lookup is invokable (§B) — so it never steals a normal edit click.

## Section B — Lookup vs. edit (the core trigger — caret stays sacred)
A bare click must ALWAYS place the caret. Two complementary ways in:
- **Primary — ⌥ / Alt-click a word** (power users, invisible + fast). Holding ⌥ lights up the overlay words;
  clicking one opens the lookup. Release → plain textarea again. No mode to remember.
- **Secondary — ⌕ Lookup-mode toggle** (a pane-header toggle; also the **touch** entry point, discoverable).
  Latches lookup on: every word becomes clickable, the caret hides, the cursor reads `help`. Tap a word, read,
  toggle off — or it **auto-exits on the first edit keypress**.
- **Esc** exits lookup-mode and returns the caret to its last position.
- **Rejected: bare hover** affordances on every word (would fight text-selection + double-click-to-select-word
  and fire constantly while editing). Selecting text + the #20 context action remains a third path for phrases.

## Section C — Word states in editable text (distinct from #20's rendered-pane chip)
- **idle** — lookup armed but nothing decorates the words until intent is signalled (flat text).
- **hover / clickable** — dotted underline (`--accent-mid`) + faint tint (`--accent-tint`) + `help` cursor.
  **Lighter** than the #20 rendered-pane chip — this is still an edit field.
- **active** — solid `--accent-soft` chip persists while the popover is open (matches #20's active-word
  highlight exactly). The active highlight is a **real selection range on the textarea**, so glyphs stay put
  and copy / IME keep working beneath the chip.

## Section D — Empty · mid-edit · streaming
- **empty** → lookup **disabled** (toggle greyed, ⌥-click no-op — nothing to look up).
- **mid-edit (typing)** → the overlay **hides while keys flow**; it re-segments + re-arms **~400 ms after the
  last keystroke** (debounced).
- **streaming (auto-run result)** → already-streamed words are lookupable; the **still-arriving tail (faint)
  is not armed until the token settles**.

## Section E — Light + dark
Same tokens in both themes; the dotted underline (`--accent-mid`) + active chip (`--accent-soft`) stay legible
on the editable surface. Never colour-alone — the underline carries the affordance. The textarea's native
caret + selection colour show through unchanged.

## Section F — Phone (long-press) & RTL
- **Touch** — a short tap moves the caret as always; a **~450 ms long-press** on a word selects it and opens
  the **#20 bottom-sheet**. The header ⌕ toggle is the discoverable touch equivalent. Native long-press
  text-selection (the OS magnifier) is suppressed **only over word spans while lookup is armed**.
- **RTL** — the overlay is built from the same wrapped lines as the textarea, so RTL + bidi runs align
  glyph-for-glyph with no left/right assumptions; #20's segmentation handles Arabic / Hebrew word breaks.

## Status / scope
The #169 headless engine — the provider `define` request + prompt, CJK/RTL word **segmentation**, the browser
`SpeechSynthesis` wrapper, `lookupStore` / `useWordLookup`, and the `WordLookupPopover` — already shipped with
feature #20. This bundle covers the **editable-pane rendering + interaction layer only**: the mirrored overlay,
the ⌥-click / ⌕-toggle / long-press trigger, the word states, and the empty/typing/streaming/RTL behaviours.

## Token mapping (design → codebase)
`--ink`→`--text-color`, `--surface`→`--bg-color`, `--canvas`→`--bg-secondary`, `--accent`→`--accent-primary`,
`--accent-soft`/`--accent-tint`→the accent-bg tokens, `--accent-mid`→accent underline, `--border*`→border
tokens, `--shadow-c*`→`--shadow-*`. Reuse the #20 popover component as-is.

Refs #169 (feature) · #173 (this design request) · builds on #164 / #20 (the shipped popover + lookup engine).

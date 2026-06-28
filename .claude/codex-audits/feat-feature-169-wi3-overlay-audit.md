---
branch: feat/feature-169-wi3-overlay
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-28
---

# Gate-4 audit — feature #169 WI-3 (`EditableLookupOverlay` + `useMirrorSync`)

Independent Claude auditor (read-only, diff-scoped). Round 1 = follow-up-recommended (0 Crit + 0 High +
**2 Medium** + 3 Low); all fixed in-branch → **ship-as-is**.

## Decisive axes — PASS
- **Caret stays sacred** — mirror root `pointerEvents:'none'` inline + unconditional; only armed word spans get
  `pointerEvents:'auto'`; gaps are bare text nodes; root `aria-hidden` while disarmed. A bare/gap click can
  never be stolen.
- **Owner-gated lookup + anchor** — armed click → `lookup({word, sentence: sentenceAt(text,start,sourceLang),
  sourceLang, targetLang, owner})`; `LookupCardHost` anchors to the clicked span (owner-gated); anchor resets
  on store close; `onProviders = () => { close(); openSettings() }`. Active = the overlay chip (NOT
  `setSelectionRange` — M5), gated on `word===seg.text && storeOwner===owner && open`.
- **No app-behavior change** — 3 new files only; not wired into any pane (WI-4); existing tests unaffected.
- **lucid** — tokens only; light/dark; RTL `dir` inherited; CJK via `wordSegments`; no `any`/vendor; <300 lines.

## Findings — all FIXED in-branch (commit 9861749)
- **M1 (FIXED) — opaque chip occluded the glyph.** The transparent mirror's opaque hover/active chip bg painted
  a solid block over the word. Fixed like #20's `ClickableText`: hover AND active spans set `color:
  var(--accent-ink)` so the mirror paints a visible glyph over its fill; active aligned to #20 exactly
  (`--accent-subtle` bg + `--accent-ink` glyph + inset underline). Word is now legible.
- **M2 (FIXED) — scrollbar gutter not excluded → glyph drift on wrapped lines.** `useMirrorSync` dropped
  `inset:0`; the mirror is now sized to `textarea.clientWidth`/`clientHeight` (scrollbar-excluded), positioned
  at the padding box, re-measured on text change + ResizeObserver + fonts.ready. Locked by a test.
- **Low-3 (FIXED)** — clones the textarea's actual `unicode-bidi` (no forced `plaintext` → no RTL mixed-line
  reorder). **Low-4 (FIXED)** — `isActive` requires exact `activeStart === seg.start` (no null-fallback →
  repeated words don't all light up). **Low-5 (FIXED)** — `useMirrorSync` clone-contract smoke assertions
  (`pre-wrap`, transparent border, width-from-clientWidth, bidi≠plaintext).

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build; **1756 tests** (overlay 12). jsdom returns
0-rects/default styles, so glyph-for-glyph alignment + hover/active legibility (the M1/M2 payoff) are
behavior-locked here and **CDP-slice-verified at WI-4** (the first time a real textarea hosts the overlay).

## Verdict
ship-as-is (round-1 Mediums + Lows all fixed in-branch).

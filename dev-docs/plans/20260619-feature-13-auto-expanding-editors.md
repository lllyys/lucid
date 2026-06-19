# Feature #13 — Auto-expanding editor panes

- **Status:** PLANNED (Gate 2 pending)
- **GH:** #97 (feature) · design #107 (closed, delivered)
- **Tracker row:** `docs/features.md` #13 (Medium)
- **Design bundle:** `dev-docs/designs/lucid-auto-expanding-editors/` (committed PR #116)
- **Slug:** auto-expanding-editors

## Problem

The editable editors (Translate Source, Polish Original, Polish Draft) are fixed-flex-share with an inner
scrollbar — tall text is clipped to a small window the reader must scroll inside (user: "we don't need the
scroll bar; can this box auto-expand?", refs #97). The committed design changes the sizing model: editors
**grow to fit their content** (no inner scroll), rest at a min-height, and a **max-height cap** restores
an inner scroll only for huge pastes. The **panel column** reflows/scrolls instead of the cards.

## Design reference (rule 51 — committed bundle)

`dev-docs/designs/lucid-auto-expanding-editors/project/Lucid Auto-expanding Editors (feature 13).dc.html`:
grow-to-content · resting **min-height ≈ 130px** (card) · **max-height ≈ 88vh** → inner scroll returns ·
**column reflow** (Original + Draft grow independently, sibling cards keep content height, the column owns
the scroll, the fixed Keywords card stays reachable) · **script-aware** (CJK denser, Arabic taller, RTL
right-anchored, latin runs stay LTR in an RTL block) · textarea + card share one measured height.

## Surface area (file-by-file)

Pure **className** changes (no logic, no JS) — this is a CSS-only sizing change.

| File | Line | Current | Target |
|---|---|---|---|
| `src/components/polish/OriginalCard.tsx` | 18 (card) | `flex min-h-[120px] flex-1 flex-col overflow-hidden rounded-[14px] border …` | `flex min-h-[130px] shrink-0 flex-col overflow-hidden rounded-[14px] border …` (**drop `flex-1`, add `shrink-0`** so the card keeps content height and does NOT compress — Gate-2 HIGH-1; the design uses `flex:0 0 auto`) |
| `src/components/polish/OriginalCard.tsx` | 36 (textarea) | `min-h-0 flex-1 resize-none …` | `field-sizing-content min-h-[88px] max-h-[88vh] resize-none …` (grows to content; **`max-h-[88vh]` caps it** so one editor can't eat the viewport — Gate-2 MED-1) |
| `src/components/polish/DraftCard.tsx` | 28 (card) | same as Original card | same as Original card |
| `src/components/polish/DraftCard.tsx` | 68 (textarea) | same as Original textarea | same as Original textarea |
| `src/components/translate/TranslatePanel.tsx` | 126 (textarea) | `min-h-0 flex-1 resize-none …` | `field-sizing-content min-h-[88px] max-h-[88vh] resize-none …` (cap → inner scroll for huge pastes) |
| `src/components/translate/TranslatePanel.tsx` | 66 (section) | `flex min-h-[296px] flex-col border-b` | **`flex min-h-[296px] shrink-0 flex-col border-b`** — **(Gate-5-verified key fix)** the explicit `min-h-[296px]` overrides flex's `min-height:auto`, so without `shrink-0` the parent `<main>` flex-col SHRINKS this section below its content and the grown Source overflows onto the Polish panel (confirmed via CDP geometry: section 342px vs Source 490px → overlap). `shrink-0` makes the section keep content height; `<main overflow-auto>` then scrolls. |
| `src/components/translate/TranslatePanel.tsx` | 103 (row) | `flex min-h-0 flex-1` | **`flex items-start`** — drop `min-h-0 flex-1` so the row sizes to content (not bounded to the section's flex space), and `items-start` decouples the source/result heights (default `stretch` would couple them). The source (`:104`) + result (`:129`) sections keep `flex-1` for equal WIDTH. |

- **PolishPanel** (`src/components/polish/PolishPanel.tsx:147`): the card column is ALREADY
  `flex flex-1 flex-col gap-3.5 overflow-auto p-4`. Once the cards are `shrink-0` (content-sized,
  non-compressing), their combined content overflows the bounded column → the column's `overflow-auto`
  scrolls, the cards keep their content height, and the `flex-none` `KeywordsCard` stays reachable at the
  bottom (design Section D). No PolishPanel change needed (confirm in browser). The `88vh` cap is enforced
  per-editor by each textarea's `max-h-[88vh]`, so one editor can't exceed the viewport; the column owns
  the reflow scroll. **Resting empty height = `max(130px card-min, header ≈ 42px + 88px textarea-min)`**
  ≈ 130px (Gate-2 LOW-1 — the two minimums roughly agree; a taller wrapped header just wins).
- **Height chain** (`Workspace.tsx`): `h-dvh overflow-hidden` root → `<main … overflow-auto>` (the
  scroller) → panels. `max-h-[88vh]` resolves against the viewport (`h-dvh`), matching the design's
  "can't push the panel offscreen."

### Files OUT of scope
- Result/output panes (`TranslateResult`, `PolishResult`) — not editable; the row scopes this to editable
  inputs only.
- `KeywordsCard` — already `flex-none` (fixed); stays as-is.
- `src/components/ui/textarea.tsx` — the shadcn primitive (already uses `field-sizing-content`); these
  editors are raw textareas that override the class, so the primitive is untouched.

## Prior art / precedent / rejected alternatives
- **`field-sizing-content`** (native CSS auto-grow for form controls) is ALREADY used by
  `src/components/ui/textarea.tsx:10`, so the project already relies on it (Chrome 123+/modern engines).
  Reusing it is the no-JS, no-dep path.
- **Rejected — a JS resize-observer / scrollHeight-measuring hook**: more code, more tests, and a
  re-render on every keystroke; `field-sizing-content` does it in the layout engine for free. Only revisit
  if a target browser lacks support (none in scope).
- The `min-h-[Npx]` / `max-h-[Nvh]` arbitrary Tailwind values are already used across the workspace (v4).

## Work-item sequencing
| WI | Tier | Design-gated? | PR size |
|---|---|---|---|
| WI-1 (only) — content-size the 3 editors + verify column reflow + translate flex | behavioral (CSS-only) | depicted in the committed bundle ✓ | small (1 PR) |

Single WI completes the feature → **minor** version bump (rule 40). Per the feature-workflow audit table,
Small (1 PR) = 1 plan audit + 1 PR audit.

## Test catalogue
- **CSS-only → no new unit tests** (rule 10: CSS-only changes use visual QA, not unit tests; auto-grow is
  pure layout-engine behavior jsdom can't measure). The existing `PolishPanel.test.tsx` +
  `TranslatePanel.test.tsx` (render + content-flow, no height assertions) MUST stay green — a regression
  there means a structural break.
- **Gate-5 browser visual QA is the behavioral verification** (rule 47 Gate 5 — behavioral WI, slice
  verify in the browser against the design): empty editor rests at ~130px; typing/pasting grows the card
  with no inner scrollbar; a huge paste hits the ~88vh cap and the inner scrollbar returns; the Polish
  column scrolls (cards keep content height, Keywords reachable at the bottom); CJK + RTL + mixed-script
  grow correctly (RTL right-anchored). Plus the Gate-2-driven checks: **(a)** TranslatePanel source +
  result size to independent heights (`items-start`) — the source grows without forcing the result pane to
  match (HIGH-2); **(b) streaming-fill** — "Translate original" streams into the Draft card; verify the
  card grows + the column reflows acceptably and the streamed text isn't stranded below the fold (MED-3 —
  auto-scroll-into-view during streaming is OUT of scope for this CSS change, a conscious call; the user
  can scroll the column); **(c)** scrollbar-gutter — when the column toggles to scrolling, confirm the
  content shift is imperceptible (rule-32 thin scrollbars; LOW-4). Recorded in the PR (Gate 5a) + evidence
  file (Gate 5b, final WI).

## Risks + mitigations
- **Translate panel flex (source + result side-by-side in a `min-h-[296px]` row)**: making the source
  content-sized may leave the result pane stretching to match or the row not growing. Mitigation: adjust
  the row/section flex so the source drives height (de-`flex-1` where needed) and **verify in the browser**
  — this is the one spot most likely to need iteration. The result pane keeps its own overflow.
- **`field-sizing-content` support**: modern-engine only (Chrome 123+); already a project dependency via
  the shadcn textarea, so no new risk. Documented.
- **Cap + inner scroll**: `max-h-[88vh]` on all three editors; past the cap the textarea is the scroller
  (native), so the card's `overflow-hidden` (which clips only the rounded corners) does not clip it — the
  scrollbar lives inside the textarea. Gate-5 confirms the scrollbar renders cleanly inside the radius +
  `py-3` padding (MED-2 sub-point 1).
- **RTL/CJK height**: the editors already set `dir="auto"` + `unicodeBidi: plaintext`; `field-sizing-content`
  measures the wrapped result per script. Verify Arabic/Hebrew/CJK in the browser.
- **No inner scroll lost for accessibility**: the cap preserves a scroll path for enormous content; below
  the cap there's nothing to scroll (all content visible) — intended.

## Known limitations (accepted scope cuts)
- **Top-fade affordance deferred** (Gate-2 MED-2). The design depicts a top fade signalling scrolled-above
  content when an editor is at the cap. A *correct* fade (shown only while scrolled) needs scroll-position
  JS — which would turn this CSS-only WI into a JS+tests change. The native scrollbar already signals the
  cap, so the fade is polish, not load-bearing for the sizing behavior. **Deferred to a follow-up**; not
  silently dropped. (If revisited, it's a small scroll-listener + an absolutely-positioned gradient.)
- **No auto-scroll-into-view during streaming** (MED-3) — see Gate-5 check (b); a conscious scope call.

## Backward compat
Purely visual/layout; no data, store, provider, or API change. No persisted state touched. Older content
renders identically (just taller, un-clipped). Reversible by restoring the className strings.

## Revision history
- 2026-06-19 v1 — initial plan (Gate 1), grounded in the committed design bundle + a layout map.
- 2026-06-19 — Gate 2 round 1: **NEEDS REVISION** (0 Critical, 2 High, 3 Medium; all file:line/className
  refs verified accurate). Findings: HIGH-1 cards need `shrink-0` (not just dropping `flex-1`) or flexbox
  compresses them instead of the column scrolling; HIGH-2 the translate source/result are stretch-coupled
  to equal height — needs `items-start`, specified now not browser-deferred; MED-1 the `88vh` cap was only
  on the Translate editor (Polish editors unbounded); MED-2 top-fade is a depicted state (needs scroll JS);
  MED-3 streaming-fill unanalyzed; LOW-1 resting height = `max(130, header+88)`; LOW-2 existing tests stay
  green (confirmed); LOW-3/4 browser-support + scrollbar-gutter notes.
- 2026-06-19 v2 — all High + Medium addressed: cards `shrink-0`; `max-h-[88vh]` on all three editors;
  TranslatePanel row `items-start` (concrete decoupling); top-fade → Known limitations (deferred, keeps the
  WI CSS-only); streaming-fill + scrollbar-gutter + independent-height → Gate-5 checks; resting-height
  arithmetic noted. 0 open Critical/High/Medium → Gate 2 clean. (Re-audit not required — the fixes are
  mechanical className changes the round-1 audit prescribed; the per-WI Gate-4 audit re-verifies the diff.)
- 2026-06-19 — Gate-5 browser verification (Chrome headless via CDP) found + fixed a real layout bug the
  plan's `items-start`-only translate fix missed: the `min-h-[296px]` section needed **`shrink-0`** or the
  grown Source overflowed onto the Polish panel (geometry-confirmed). Final translate diff: section
  `shrink-0`, row `flex items-start` (de-flex-1), source textarea content-sized. All 5 design behaviors
  verified — grow-to-content (Source 91→490px, Original 88→422px), ~130px resting, 88vh cap → inner scroll
  (120 lines → 803px), translate grows with no overlap, polish column reflow. Evidence:
  `dev-docs/verification/feature-13-20260619.md`.

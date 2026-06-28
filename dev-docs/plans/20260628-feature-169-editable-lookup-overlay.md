# Feature #169 — Word-lookup inside editable fields (mirror overlay)

Status: Gate 2 (v2, audited round 1) · GH #169 · design `dev-docs/designs/lucid-word-lookup-editable/` (closed #173) · builds on #20

## Problem
The translate **source**, polish **Original**, and polish **Draft** panes are `<textarea>`s — raw text with a
caret, no per-word DOM nodes — so the shipped #20 word-lookup can't reach them. #169 adds a **mirrored
click-overlay** + a **lookup-vs-edit trigger** so a user can click a word to look it up *without breaking
editing*. The result popover is **#20, reused** (design §A.4, "reuse the #20 popover as-is").

## Prior art / precedent
- The "mirror div over a textarea" technique (a typography-cloned, scroll-synced div of spans over the
  textarea; the textarea stays editable underneath) is the established pattern; the design specifies it exactly.
- **Reuse from #20:** `tokenize` + `sentenceAt` (`src/lib/lookup/segment.ts`); `useWordLookup` →
  `{ lookup, close }` where `lookup(payload)` takes `LookupPayload { word, sentence, sourceLang?, targetLang }`
  (**`targetLang` required**); and — after the WI-1 refactor — a shared **`LookupCardHost`**.
- **Rejected:** bare hover affordances (fight selection + double-click-select-word) — design §B.

## Gate-2 round-1 correction (the core fix) — the lookup HOST is shared, owner-gated
The audit found the plan's "`WordLookupPopover`/`lookupStore` out of scope" premise is **false**:
- **`lookupStore` has a single global `open` flag with no owner.** With the overlay mounted alongside the
  rendered-pane `WordLookupPopover` (translate: source overlay + `TranslateResult`; polish: Original + Draft
  overlays + `PolishResult`), a lookup in one host would open **every** host's popover. (H1)
- **The card-host logic** (speech `createSpeech`/`voiceschanged`, `playKind`, tier `Popover`↔`Sheet`, `dir`,
  retry, `onProviders`, active-word tracking) lives in `WordLookupPopover`, not `LookupCard`. (H2)

**Resolution (WI-1, one refactor):** extract **`LookupCardHost`** from `WordLookupPopover` — it owns speech +
play + the desktop-`Popover`/phone-`Sheet` tier switch + `dir` + `LookupCard`, and takes an **external anchor +
an `owner` id**. Add `owner: LookupOwner` (**required** in `LookupPayload`, set in `lookup()`) to `lookupStore`;
every host gates its surface on `open && owner === thisHostId`. `WordLookupPopover` becomes a thin wrapper
(`ClickableText` + `LookupCardHost`); the overlay uses `LookupCardHost` (owner per pane). Matches the design's
"reuse the popover as-is."

**Gate-2 round-2 fix (H1 — the owner enum must be host-unique).** BOTH result panes are always mounted
(`Workspace` renders `TranslatePanel` + `PolishPanel` as concurrent siblings; phone keeps both via a `hidden`
wrapper), so a single `'rendered'` value would still bleed across `TranslateResult` ↔ `PolishResult`. The enum is
therefore **one owner per lookup host (5)**: `LookupOwner = 'translateResult' | 'polishResult' | 'translateSource'
| 'polishOriginal' | 'polishDraft'`. Also **owner-gate the rendered-pane active-word chip** — `WordLookupPopover`'s
`activeWord = open && active && active.word === storeWord ? active : null` must additionally require
`owner === <this pane>`, else a `'translateSource'` lookup whose word text matches a rendered word paints a
spurious chip in a result pane. This closes the pre-existing #20 single-`open`-flag bleed at the same time.

## Surface area (file-by-file)
### WI-1 — shared `LookupCardHost` refactor + owner discriminator (foundational)
- **`src/stores/lookupStore.ts`** — add **required** `owner: LookupOwner` (the 5-value host enum above) to state
  + `LookupPayload`; `lookup()` stamps it; define the **initial** `owner` (e.g. `'translateResult'`, irrelevant
  while `open===false`) and `close()` leaves/normalizes it (gating is on `open && owner===…`, so `close()` need
  only set `open:false`). (gated `src/stores` → 100%.)
- **NEW `src/components/lookup/LookupCardHost.tsx`** — extracted from `WordLookupPopover`: the `speech`/`forceTick`
  subscription + unmount/word-change `speech.cancel()` cleanup, store reads feeding `data`/`play`/`dir`/`label`,
  `playKind`/`onTogglePlay`/`onRetry`, the `card()` renderer, `onOpenChange`, `onOpenAutoFocus` preventDefault,
  and the `Popover`/`Sheet` tier switch. Props = `{ anchorEl (a `virtualRef`/element — **not** `PopoverAnchor
  asChild`, since the anchor is external; reconciles L10), owner, onProviders }`; renders only when
  `open && owner === props.owner`.
- **`src/components/lookup/WordLookupPopover.tsx`** — refactor to the thin wrapper: keeps `active` tracking +
  `labels = directionLabels(detectDirection(text))` + `onActivate` + `<ClickableText>`, feeds its container ref
  as the `anchorEl` (preserves today's whole-block anchor) + `owner` (`'translateResult'`/`'polishResult'` —
  passed in by the result pane), and **owner-gates `activeWord`**. Behavior unchanged — regression-tested.
  Its `*.test.tsx` `setStore` helper must add the matching `owner` (else the `open`-gate tests fail).

### WI-2 — trigger/arm logic (foundational, 100%-gated)
- **NEW `src/lib/lookup/editableLookupState.ts` (+ test)** — a **pure reducer** for the arm decision (L11): given
  `{ mode:'off'|'alt'|'latched', textNonEmpty, typing, streaming, composing }` → `armed: boolean`, plus the mode
  transitions (`altDown`/`altUp`/`toggle`/`exit`/`editKey`). In `src/lib/lookup/**` so its branches hit the 100%
  gate.
- **NEW `src/lib/lookup/overlaySegments.ts` (+ test)** — `wordSegments(text, locale)` → word segments (kind
  `'word'`) + `[start,end]` offsets from `tokenize` (gaps excluded), for the overlay + `sentenceAt` on click.
- **NEW `src/hooks/useEditableLookup.ts` (+ test)** — thin React glue over the reducer: Alt key listeners
  (keydown/keyup), **reset on `window` blur + `visibilitychange`** (L9; Alt+other-key = edit, not arm),
  composition tracking, the ~400 ms typing debounce, `toggle()`/`exit()` (Esc / first edit keypress → off).

### WI-3 — the mirror overlay component (behavioral · design-gated, bundle landed)
- **NEW `src/components/lookup/EditableLookupOverlay.tsx` (+ test)** — wraps a textarea in a relative container;
  renders the **mirror** div over it, **typography-cloned via `getComputedStyle`** (font, size, line-height,
  letter-spacing, padding, border, **box-sizing**, **text-align**, **unicode-bidi**, white-space:pre-wrap,
  overflow-wrap, tab-size, dir, width incl. scrollbar gutter — L7) and **scroll-synced** (`scrollTop/Left` ←
  textarea on `scroll`; `ResizeObserver`; re-measure on text change + `document.fonts.ready`). Renders
  `wordSegments` as spans; **armed** word spans = `pointer-events:auto`, gaps = `pointer-events:none` (clicks
  fall through to the textarea → caret stays sacred). Word states: idle (none), hover (dotted `--accent`
  underline + faint tint + `cursor:help`), **active** = the **overlay span gets the accent-bg chip** (NOT a real
  textarea selection — M5: no caret mutation/focus fight; the chip sits over the glyphs via the mirror, same
  visual). Clicking an armed span → `lookup({ word, sentence: sentenceAt(...), sourceLang, targetLang })` (owner
  per pane) and anchors `LookupCardHost` to **that span** (per-word `PopoverAnchor asChild` — L10). Overlay root
  `pointer-events:none` unless armed. Tokens only; light/dark; RTL.

### WI-4 — wire into the 3 panes + toggle + touch (behavioral · FINAL)
- **`TranslatePanel.tsx`** (source), **`OriginalCard.tsx`**, **`DraftCard.tsx`** — wrap the textarea in
  `EditableLookupOverlay` + a ⌕ **lookup-mode toggle** in the pane header (also the touch entry). Per-pane langs
  (M4): **source** = `directionLabels(detectDirection(text))` (src→tgt); **Original** = the polish `srcLang→tgtLang`
  (from the pickers, NOT detectDirection — polish langs are arbitrary); **Draft** is in the target language → its
  lookup `sourceLang = tgtLang`, `targetLang = srcLang` (inverted; `Draft.lang === tgtLang`). Always supply
  `targetLang`. **Lang threading (round-2):** `OriginalCard`/`DraftCard` receive only their own `lang` today —
  so wrap their overlay at the **`PolishPanel`** level (where both `srcLang`/`tgtLang` live) or thread the sibling
  lang into the cards; the translate source has both via `directionLabels`.
- **Draft streaming (M3):** **disarm the entire Draft overlay while streaming** — gate on `!translating` (the
  boolean `DraftCard` already gets: `translating = dt.status==='streaming'`; `!translating` also correctly arms a
  manually-typed, never-translated draft). No per-word streaming arming (avoids #20's offset-staleness). Source/
  Original need only empty + typing-debounce gating (L8 — they're never machine-written).
- **Close-on-edit (M6):** key close to the **text value changing** (a `useEffect` on the textarea value), not the
  `onChange` event — programmatic writes (Draft stream via `setDraft`, swap/clear/accept) bypass `onChange`. If a
  lookup is open for that owner when the text changes, `close()` it (the anchored offset would otherwise go
  stale). (Draft stream writes are moot under M3's disarm-until-settled, but the effect is the robust key.)
- **Touch (design §F):** ~450 ms long-press on a word span → the `LookupCardHost` `Sheet` (phone tier); a short
  tap lands the caret; native long-press selection suppressed only over word spans while armed.
- **i18n** `lookup.editable.*` (toggle label/aria).

### Files OUT of scope
- The #20 lookup engine internals (`useWordLookup`, `segment.ts`, `LookupCard`) — reused; only `lookupStore`
  (owner field) + `WordLookupPopover` (→ thin wrapper over `LookupCardHost`) change, both in WI-1.
- The diff/accept logic, the rendered-pane lookup behavior (unchanged post-refactor) — untouched.

## Work items
- **WI-1 (foundational · patch)** — `LookupCardHost` extraction + `owner` in `lookupStore`/`LookupPayload` +
  `WordLookupPopover` thin-wrapper refactor. Regression: rendered-pane lookup unchanged; only the active owner's
  surface opens. Tests: owner-gating (two hosts mounted → only the matching owner opens), the host renders speech/
  tier/dir as before.
- **WI-2 (foundational · patch)** — `editableLookupState` reducer + `overlaySegments` + `useEditableLookup`.
  Tests: arm decision (off/alt/latched × empty/typing/streaming/composing); mode transitions; Alt window-blur
  reset; word-segment offsets (ASCII/CJK/RTL/mixed).
- **WI-3 (behavioral · design-gated, landed · patch)** — `EditableLookupOverlay` (mirror + scroll-sync + states
  + owner-gated `LookupCardHost` anchored per-word). Slice-verify over a real textarea (CDP).
- **WI-4 (behavioral · FINAL · minor)** — wire 3 panes + toggle + per-pane langs + Draft-disarm-until-done +
  close-on-edit + long-press. Full acceptance + evidence.

## Test catalogue
- `editableLookupState.test` — armed true only when mode!==off ∧ non-empty ∧ ¬typing ∧ ¬streaming ∧ ¬composing;
  altDown→alt, altUp→off, toggle→latched, editKey/Esc→off.
- `overlaySegments.test` — offsets for ASCII/CJK(no spaces)/RTL/mixed; gaps excluded.
- `useEditableLookup.test` — Alt down/up arms/disarms; **window blur + visibilitychange reset**; typing debounce
  re-arms ~400 ms; composition suppresses.
- `lookupStore.test` — owner stamped by `lookup()`, cleared by `close()`.
- `WordLookupPopover.test` (regression) — rendered-pane lookup still opens (owner `'rendered'`), speech/tier/dir
  intact; an `'src'`-owner lookup does NOT open the rendered popover.
- `EditableLookupOverlay.test` — armed → spans clickable, click opens `LookupCardHost` (owner) anchored to the
  span; not-armed → root `pointer-events:none`, clicks reach textarea; scroll-sync mirrors `scrollTop`; active =
  the span chip; RTL `dir`; close-on-text-change.
- Pane wiring — toggle arms/disarms; first edit exits; Draft armed only when done; per-pane `targetLang` supplied.
- No-regression: rendered-pane lookup + plain editing both unaffected.

## Risks + mitigations
- **Pixel-perfect mirror alignment (crux)** — clone every wrap-affecting property via `getComputedStyle` (incl.
  box-sizing/text-align/unicode-bidi — L7); re-measure on text change + `document.fonts.ready`; a WI-3 test
  asserts wrapped-fixture span rects align; CDP slice-verify. #13 `field-sizing-content` auto-grow is fine if the
  mirror fills a relative wrapper + syncs scroll.
- **Caret sacred** — root `pointer-events:none` unless armed; gaps never capture; bare click always edits. Tested.
- **Cross-host popover bleed (H1)** — owner discriminator gates each host.
- **Streaming offset staleness (M3)** — Draft disarmed until done.
- **Active highlight (M5)** — overlay-span chip, no textarea-selection mutation (no caret/focus hazard).
- **Stale anchor on edit (M6)** — close the lookup on text change.
- **Alt stuck (L9)** — reset on window blur + visibilitychange.

## Backward compat
Additive — the overlay is inert until armed; plain editing unchanged. The WI-1 refactor preserves rendered-pane
behavior (owner `'rendered'`). No persisted state, no migration.

## Audit fixes applied (Gate 2, round 1 → v2)
Round 1 = NEEDS REVISION (2 High + 4 Med + 5 Low). All addressed:
- **H1+H2** → WI-1 extracts `LookupCardHost` + adds `owner` to `lookupStore`/`LookupPayload`; every host
  owner-gated; `WordLookupPopover` → thin wrapper (matches design "reuse as-is"). `lookupStore`/`WordLookupPopover`
  brought into scope.
- **M3** Draft disarmed until `done` (no per-word streaming arming). **M4** correct `useWordLookup()`→`{lookup,close}`
  signature + per-pane `sourceLang`/`targetLang` derivation (targetLang always supplied). **M5** active = overlay
  chip, not a real textarea selection. **M6** close lookup on text change.
- **Lows:** L7 clone-list (+box-sizing/text-align/unicode-bidi/fonts.ready); L8 only Draft needs the streaming
  gate; L9 alt reset on window blur+visibilitychange; L10 per-word `PopoverAnchor`+preventDefault focus; L11 the
  arm reducer lives in `src/lib/lookup/**` (100%-gated), the hook is thin glue.

## Gate-2 round-2 fixes (v3)
- **H1 (owner enum incomplete)** → `LookupOwner` is now **5 host-unique values** (`translateResult`/`polishResult`
  split — both result panes are always mounted) + the rendered active-word chip is owner-gated. Closes the
  pre-existing #20 single-`open` bleed.
- **Nice-to-haves folded:** anchor = external `anchorEl`/`virtualRef` (not `PopoverAnchor asChild`); Draft gate =
  `!translating` (the real boolean); polish overlay wrapped at `PolishPanel` level so both `srcLang`/`tgtLang` are
  available; close-on-edit keyed to the value via `useEffect` (programmatic writes bypass `onChange`); `owner`
  **required** in `LookupPayload`; `WordLookupPopover.test` `setStore` must add `owner`; **file-size watch** —
  split `EditableLookupOverlay`'s measurement into a `useMirrorSync` hook if it nears ~300 lines.

## Manual Audit Evidence (Gate-2 round 3 — AI auditor stalled)
The round-3 confirm auditor stalled on infrastructure (no stream progress 600s; no verdict — not a finding).
Per rule 47 (manual fallback when the auditor is unavailable), the one load-bearing round-2 fix (owner-enum
completeness) was verified by hand:
- **Files read / symbols verified:** every `<WordLookupPopover` mount — `src/components/translate/TranslateResult.tsx:56`
  + `src/components/polish/PolishResult.tsx:175` (exactly **2** rendered hosts); the 3 editable textareas
  (`TranslatePanel.tsx`, `OriginalCard.tsx`, `DraftCard.tsx`). → **5 lookup hosts total = the 5-value
  `LookupOwner` enum, no sixth host.** Each result pane's owner is **static** (passed as a prop), so the gate is
  resolvable. `src/stores/lookupStore.ts`: `LookupPayload` (:19) + `open` (:38) + `lookup()`/`close()` (set
  `open` :81/:100) — adding required `owner` + stamping in `lookup()` is clean (gated 100%).
  `WordLookupPopover.tsx:79` `activeWord = open && active && active.word === storeWord` — the exact line to add
  `&& owner === <pane>` for chip gating.
- **Edge cases checked:** two result panes always mounted (`Workspace` siblings) → now distinct owners (bleed
  closed); same-word lookup across panes → owner gate prevents the spurious chip; no other mount point.
- **Risks accepted:** none open. **Verdict: round-2 High CLOSED → READY TO BUILD.** (Round 1: 2 High + 4 Med
  fixed; round 2: 1 High fixed; this manual round confirms the round-2 fix. 0 open Crit/High/Med.)

## Revision history
- v1 (2026-06-28) — initial draft.
- v2 (2026-06-28) — Gate-2 round-1 fixes (2 High + 4 Med + 5 Low).
- v3 (2026-06-28) — Gate-2 round-2 fix (1 High: owner enum host-unique + active-chip gating) + 6 nice-to-haves.
  **Gate-2 PASSED** (round-3 confirm manual — AI auditor stalled; owner-enum completeness verified by hand,
  0 open Crit/High/Med).

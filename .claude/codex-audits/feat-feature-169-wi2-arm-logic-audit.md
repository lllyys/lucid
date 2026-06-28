---
branch: feat/feature-169-wi2-arm-logic
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-28
---

# Gate-4 audit — feature #169 WI-2 (arm-logic reducer + overlay segments + hook)

Independent Claude auditor (read-only, diff-scoped, 507-line diff, all new files). **ship-as-is, 0 open
Critical/High/Medium.**

## Verified
- **`editableLookupState.ts`** — `isArmed = mode!=='off' && textNonEmpty && !typing && !streaming && !composing`
  (every operand disarms; 100% branch). `nextMode` table correct on the contested pairs: `latched` survives
  `altDown`/`altUp`; `toggle` flips `latched`↔`off`; `alt` arms transiently; `exit`/`editKey` → `off`. All 15
  (mode×event) pairs pinned in tests; switch exhaustive over the union.
- **`overlaySegments.ts`** — `wordSegments` reuses #20 `tokenize` (no reimpl), keeps word segments, correct
  UTF-16 `{text,start,end}` (`text.slice(start,end)===segment.text` for ASCII/CJK/Arabic/mixed); gaps excluded;
  empty → []. 100% (only the `isWord` predicate branch).
- **`useEditableLookup.ts`** — Alt keydown/keyup arm/disarm; Escape→exit (checked before the altKey branch);
  Alt+other-key→editKey (edit, not arm); **window blur + document visibilitychange reset to off** (L9 — alt
  can't stick after Cmd/Option-Tab); composition (window events + `setComposing`) suppresses; 400 ms typing
  debounce via a ref (no stale closure; `setMode((m)=>nextMode(m,e))` functional updater); **all listeners
  removed (stable `useCallback([])` deps); timer cleared on unmount**. Returns `{mode,armed,typing,composing,
  onTextInput,toggle,exit,setComposing}` — everything WI-3 needs.
- **Coverage / lucid** — `src/lib/lookup/**` 100%-gated (both new libs fully branch-covered, non-contrived);
  `src/hooks/**` not gated but genuinely TDD'd (fake timers + real window events). No `any`; 54/26/127 lines.

## Lows (1 fixed, 2 carried to WI-4)
- **Low (FIXED):** the `editKey` doc comment overstated ("the first edit key") — plain typing in `latched`
  intentionally stays latched and disarms via the debounce; only an Alt+other-key fires `editKey`. Reworded the
  comment (rule 22) to match the wiring + the test (`plain typing keydown does not exit latched`).
- **Low (→ WI-4):** blur/visibilitychange uses `exit`, which clears a deliberate `latched` on a tab-away. The
  plan pins this; revisit if a latch should survive a tab-away (a WI-4 UX call).
- **Low (→ WI-4):** WI-4 mounts the hook in 3 panes → a single Alt press arms all three overlays + IME in any
  textarea suppresses all three (window-level listeners ×3). Fine given WI-1 owner-gating (only the clicked
  pane's popover opens), but a deliberate note for WI-4, not a surprise.

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build; **1744 tests**. Foundational logic → no
browser verification (rule 47); WI-3 (the overlay) is the behavioral, design-gated, slice-verified WI.

## Verdict
ship-as-is (the one Low fixed in-branch; two carried to WI-4 as deliberate notes).

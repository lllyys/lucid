---
branch: feat/feature-169-wi1-lookup-host
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-28
---

# Gate-4 audit — feature #169 WI-1 (`LookupCardHost` extraction + `owner` discriminator)

Independent Claude auditor (read-only, diff-scoped, 832-line diff). **ship-as-is, 0 open Critical/High/Medium.**

## Verified
- **No behavior change** — the host logic moved into `LookupCardHost` intact (speech/`forceTick` subscription +
  the unmount/word-change `speech.cancel()` cleanup, `playKind`/`onTogglePlay`/`play`, the `LookupCard`
  renderer, `onOpenChange`, `onOpenAutoFocus` preventDefault, the Popover/Sheet tier switch); `open` →
  `open && storeOwner === owner`. The thin `WordLookupPopover` keeps `active`/`labels`/`onActivate`/`ClickableText`.
- **Owner gating complete + correct** — `LookupOwner` = the 5 host-unique values; `owner` required in
  `LookupPayload` + state; `lookup()` stamps it (+ the two `useWordLookup` config-error paths re-stamp it);
  `LookupCardHost` renders on `open && storeOwner === owner`; `WordLookupPopover.activeWord` also requires
  `storeOwner === owner` (no cross-host chip). `TranslateResult`/`PolishResult` pass the static owners.
- **Anchor** — `PopoverAnchor virtualRef` to an external `<span ref={anchorRef}>` (always mounted → no null
  deref); same rendered block → positioning preserved. Cast to `RefObject<Measurable>` (Radix pattern), no `any`.
- **Coverage / lucid** — `lookupStore`'s new `owner` covered (100% gated); `LookupCardHost` 181 lines /
  `WordLookupPopover` ~85; no `any`; no vendor import. Existing `WordLookupPopover` suite passes for the two
  rendered owners.

## Finding fixed (Gate-4 Low → resolved, not deferred)
- **Low (FIXED): `onRetry` fidelity.** The refactor had turned `onRetry` into a no-op in the two config-error
  states (`invalidKey` / `createProvider` throw), where `close()` clears `targetLang` to undefined — the old
  code used `targetLang ?? labels.tgtCode`. **Fix:** added a `fallbackTarget?: string` prop to `LookupCardHost`,
  `onRetry` now uses `targetLang ?? fallbackTarget`, and `WordLookupPopover` passes `fallbackTarget={labels.tgtCode}`
  — restoring exact pre-refactor behavior. The inaccurate comment (rule 22) was corrected, and a regression
  test added (`error retry with a cleared targetLang falls back to the pane target`). The WI-1 "no behavior
  change" mandate is now fully met.

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build; **1700 tests**. Foundational refactor → no
browser verification (rule 47). The only behavior not exercisable under jsdom is the `virtualRef` pixel
positioning (jsdom rects are 0) — the anchor block is unchanged, so positioning is preserved.

## Verdict
ship-as-is (the one Low fixed in-branch).

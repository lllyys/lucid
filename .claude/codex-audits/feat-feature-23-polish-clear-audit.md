---
branch: feat/feature-23-polish-clear
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-29
---

# Gate-4 audit — feature #23 WI-1 (FINAL: Clear button on the polish input pane)

Independent Claude auditor (read-only, diff-scoped, 229-line diff). **ship-as-is, 0 open Critical/High/Medium.**

## Verified
- **Non-arming `clearOriginal` (the M1 decision)** — `{ setOriginal(''); resetForInput(); debounce.cancel() }`;
  does NOT call `armPolish`/`onOriginal` → Clear schedules no `scheduleRun`. `resetForInput()` →
  `reset('polish')` + `reset('draftTranslate')` → `dropController` aborts any in-flight stream + bumps `runId`
  (both ops → idle). A stale pending run is already a no-op via the fire-time runId guard; `debounce.cancel()`
  is the immediate cosmetic chip dismissal. **Clear can never fire an LLM call** — proven by the PolishPanel
  test (auto-run armed + pending chip → advance 1500ms → `polish.status` stays idle, chip gone, Original wiped).
- **Clear button** — new `onClear` prop; **leads** the header right-group (before LookupToggle + LanguagePicker,
  asserted via `compareDocumentPosition`); **shown only when `value.trim() !== ''`**; click → `onClear()` +
  refocus `lookup.textareaRef.current?.focus()` (the textarea is always mounted → safe); resting
  `--text-tertiary` → hover `--text-color` (matches translate's Clear) + the design's `focus-visible` ring
  `--accent-ink` (a real token, dark-parity + rule-33 focus); accessible name "Clear".
- **i18n** `polish.clear` = "Clear" (new flat key, reuses translate.clear's value).
- **No-regression / lucid** — only `OriginalCard` consumer (`PolishPanel`) updated with `onClear`; the normal
  `onOriginal` edit-resets-polish path + auto-run untouched; tokens not hex; no `any`; files <300; version
  bumped 0.21.0 → 0.22.0 (minor, final WI). Tests behavioral (no-arm-under-auto-run, hidden-when-empty,
  onClear-not-onChange, refocus, leading-placement).

## Lows (accepted, non-blocking)
1. No test that clicks Clear WHILE a polish stream is actively streaming (covered transitively by the
   `resetForInput`/abort tests + the runId guard; `onAccept` already calls `resetForInput` mid-stream). Optional
   add.
2. The bundle README's "identical to the translate source Clear" wording is a nuance (it then lists the
   design's additions — ring/refocus/leading); the implementation correctly follows the design's explicit spec.
   Doc-wording nit, not a code defect.

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build; **1831 tests**. FINAL WI → CDP slice-verify
(type into the polish Original → Clear appears → click → Original wiped + ops reset + Clear hidden when empty +
no LLM call) is the Gate-5 acceptance recorded in the evidence file.

## Verdict
ship-as-is.

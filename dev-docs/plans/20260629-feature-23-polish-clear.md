# Feature #23 — Clear button on the polish input pane

Status: Gate 1 (drafted) · GH #198 · design `dev-docs/designs/lucid-polish-clear/` (committed, resolves #199) · mirrors the translate source Clear

## Problem
The translate **source** pane has a **Clear** button (`TranslatePanel.tsx`, `translate.clear`) to wipe the
input; the polish **Original** (input) pane has none. Triage 2026-06-29 ("we need a 'clear' button for polishing
too") — a parity request. (Distinct from #18, the polish-goal selector.) The committed design
`dev-docs/designs/lucid-polish-clear/` depicts it with an explicit implementation spec → rule 51 satisfied.

## Surface area (file-by-file)
- **`src/components/polish/PolishPanel.tsx`** — add a **dedicated non-arming** `clearOriginal` handler and pass
  it to `OriginalCard` as a new `onClear` prop (Gate-2 M1). `onOriginal('')` (the normal change path) calls
  `armPolish(...)` → under auto-run it would **schedule a debounced LLM re-polish on Clear** (a surprising cost,
  and divergent from translate's `clear()` which never arms). So Clear must NOT route through `onChange`:
  `const clearOriginal = () => { setOriginal(''); resetForInput() }` — wipes the Original + `resetForInput()`
  (which `reset('polish')` + `reset('draftTranslate')` → aborts any in-flight stream via `dropController` +
  runId-guard) **without `armPolish`**. This faithfully mirrors translate's `clear()` (`setSource('')` +
  `reset('translate')`, no arm).
- **`src/components/polish/OriginalCard.tsx`** — add a new `onClear: () => void` prop + a **Clear** `<button>` in
  the header **leading the right-side control group** (before `LookupToggle` + `LanguagePicker`). Borderless text
  button, Geist 12px, resting `--text-tertiary` (the design's `--t5`, the translate Clear's resting token) →
  hover `--text-color`. **Per the committed design (rule 51 authoritative): add a `focus-visible` ring
  `--accent-ink` + refocus the Original textarea on click** — these go beyond translate's Clear (which has no
  custom ring + no refocus), but the design specifies them. **Shown only when `value.trim() !== ''`** (hidden
  when empty; the `LookupToggle` already disables itself when empty — consistent). On click: `onClear()` +
  refocus `lookup.textareaRef.current` (the #169 ref; `?.focus()` guard). Localized + RTL-mirrored (the header
  flex row mirrors under `dir`).
- **`src/locales/en/translation.json`** — `polish.clear` = "Clear" (a new flat key reusing the `translate.clear`
  string value).

### Files OUT of scope
- The Draft pane + DraftCard — unchanged (the Original Clear wipes only the Original + the two ops; the Draft
  text field is separate input, untouched — matching the design's "resets the dependent draft/polish
  **operation** state", not the Draft text). The translate source Clear — unchanged (pattern mirrored). #18 goal
  selector — untouched.

## Prior art / precedent
- The **translate source Clear** (`TranslatePanel.tsx`) is the exact pattern: a borderless text button that
  `setSource('')` + resets the op. Polish's `onChange('')` is the equivalent (PolishPanel's handler resets the
  polish op on any Original edit), so the Clear button is a thin wrapper + refocus.

## Work items
- **WI-1 (behavioral · FINAL · minor) — the Clear button.** PolishPanel `clearOriginal` (non-arming) + the new
  `onClear` prop + the `OriginalCard` Clear (visibility on `value.trim()`, `onClear` + refocus, design styling)
  + `polish.clear` i18n. One PR. **Tail steps (Gate-2 L2):** version bump (minor — final WI, rule 40) as the
  last commit before the PR, and a `dev-docs/verification/feature-23-<date>.md` evidence file (required to flip
  the row to VERIFIED — hook-enforced). CDP slice-verify: type into the polish Original → Clear appears → click →
  Original wiped + the polish op reset + Clear hidden when empty + (auto-run armed) NO re-polish scheduled.

## Test catalogue
- `OriginalCard` — Clear is **hidden when `value` is empty/whitespace**, **shown when non-empty**; clicking it
  calls **`onClear`** (not `onChange`); after clear, focus returns to the Original textarea; accessible name
  "Clear" (`polish.clear`); placed before the LookupToggle/LanguagePicker.
- `PolishPanel` — `clearOriginal` wipes the Original AND resets both the polish + draftTranslate ops, and
  **does NOT `armPolish`/schedule an auto-run** even when auto-run is armed (the M1 guard — Clear is not an LLM
  trigger).
- No-regression: the existing OriginalCard behavior (edit, lookup toggle, language picker) + PolishPanel's
  edit-resets-polish (the normal `onOriginal` path) are unaffected.

## Risks + mitigations
- **Clear must not fire an LLM call (Gate-2 M1)** — Clear uses the dedicated `clearOriginal` (no `armPolish`),
  not `onChange('')`; so it mirrors translate's `clear()` and never schedules an auto-polish.
- **"Resets the dependent draft/polish state" scope** — `resetForInput()` aborts + resets the polish +
  draftTranslate ops (verified: `reset` → `dropController` aborts the stream + bumps runId; the `run()` loop's
  `isStale` guard drops stale writes). The Draft text field is NOT wiped (separate input) — matches the design's
  "operation state" wording.
- **Empty-state reflow** — hide-when-empty (per the design); disabled-at-40% is the design's acceptable fallback
  if hiding reflows — prefer hide.
- **Refocus on a possibly-unmounted ref** — `?.focus()` guard (the Original textarea is always mounted anyway).

## Backward compat
Additive — a header button + one i18n key; no store/persistence change; existing flows unchanged.

## Open questions (Gate-2)
- Confirm `onChange('')` resets the polish op (the edit-reset path) so a stale polish stream can't survive the
  clear; confirm the Original textarea ref for refocus (`usePaneLookup`'s `textareaRef`, #169).
- Confirm the design's "hide when empty" vs the `LookupToggle`'s disable-when-empty stay visually consistent.

## Audit fixes applied (Gate 2, round 1 → v2)
Round 1 = NEEDS REVISION (1 Med + 2 Low). All addressed:
- **M1** — Clear no longer routes through `onChange('')` (which `armPolish`s → would fire a debounced LLM
  re-polish under auto-run). Added a dedicated non-arming `clearOriginal` in `PolishPanel` + an `onClear` prop;
  `PolishPanel` is now in scope (the "unchanged" claim was the root cause) + a test asserts Clear does not arm.
- **L1** — dropped "identical to the translate source Clear" framing: the design ADDS a focus ring + refocus +
  leading placement (translate's Clear has none of those + is trailing). Build per the design (rule-51
  authoritative); only the resting/hover tokens match translate.
- **L2** — added the FINAL-WI tail steps (version bump rule 40 + the `dev-docs/verification/feature-23-*.md`
  evidence file) to the WI checklist.

## Revision history
- v1 (2026-06-29) — initial draft.
- v2 (2026-06-29) — Gate-2 round-1 fixes (1 Med: non-arming `clearOriginal` + `onClear` prop; 2 Low). Awaiting
  round-2 confirm.

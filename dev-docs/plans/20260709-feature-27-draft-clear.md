# Feature #27 — Clear button on the DRAFT-to-polish box

**Status:** PLANNED
**GH:** #225 (feature) · #226 (design, landed) · relates #23 (Original Clear)
**Design:** `dev-docs/designs/lucid-draft-clear/` (committed 2026-07-09, rule 51 satisfied)
**Size:** Small (1 WI, 1 PR)

## Problem

Feature #23 (v0.22.0) added a **Clear** button to the polish **Original** card header, but the **DRAFT
TO POLISH** card (`DraftCard`) — the primary editable polish input — has none. A user who wants to
discard the draft has no one-click way to do it. This completes Clear parity across both polish inputs
(triage #225 screenshot).

## Surface area (file-by-file)

The change mirrors #23's Original Clear onto the sibling DraftCard. The one difference: DraftCard is a
**streaming target** (the `draftTranslate` op mirrors into it), so its Clear is additionally gated on
`!translating` (the design's explicit rule — while streaming, Stop is the only exit).

- `src/components/polish/PolishPanel.tsx`
  - Add a dedicated **non-arming** `clearDraft` handler, mirroring the existing `clearOriginal`
    (`:130`): `setDraft('')` + `resetForInput()` (resets `polish` + `draftTranslate`) + `debounce.cancel()`.
    It MUST NOT route through `onDraft`/`armPolish` — doing so would schedule a debounced LLM re-polish
    on Clear under auto-run (bug the #23 plan already caught). No new imports.
  - Pass `onClear={clearDraft}` to `<DraftCard>` (`:270`).
- `src/components/polish/DraftCard.tsx`
  - Add prop `onClear: () => void` (mirrors `OriginalCard`'s `onClear`).
  - Add `handleClear = () => { onClear(); lookup.textareaRef.current?.focus() }` (mirror
    `OriginalCard`'s refocus).
  - **Responsive header restructure (design phone = two rows, NOT a one-button insert).** The current
    header (`:56`) is a single non-wrapping `flex items-center justify-between` row: `[label] | [right
    group]`. The DRAFT header is busier than the Original's (it carries the wide "↻ Translate original"
    button), so adding Clear overflows a phone width — the committed design reflows it to **two rows on
    phone**. Restructure the header to:
    - **Desktop (`min-[600px]`)**: one row — `[label-group]` (left) · `[Clear · Translate-original/Stop ·
      LookupToggle · LanguagePicker]` (right, Clear FIRST). Same as today plus Clear leading the right
      group (parity with the Original Clear's slot).
    - **Phone (`max-[599px]`)**: two rows — **row 1** `[label-group]` (left) · `[Clear]` (right,
      `justify-between`); **row 2** `[Translate-original/Stop · ⌕ · LanguagePicker]`. Per the design, the
      controls wrap to row 2 and Clear keeps row 1; the phone Clear gets a **≥44px vertical hit area**
      (extra `py`).
    - Implementation: header wrapper `flex flex-col gap-2 border-b px-4 py-2.5 min-[600px]:flex-row
      min-[600px]:items-center min-[600px]:justify-between`. A label-row wrapper
      (`flex items-center justify-between gap-2.5`) holds the label + hint plus a **phone-scoped** Clear.
      The controls wrapper (`flex items-center gap-2`) leads with a **desktop-scoped** Clear, then the
      existing translating/Translate-original block + LookupToggle + LanguagePicker. Both Clears share one
      `handleClear` and the same guard `!translating && value.trim() !== ''`.
    - **Clean inverse visibility (avoid the 599/600 fractional gap):** the **phone** Clear is
      visible by default + `min-[600px]:hidden`; the **desktop** Clear is `hidden min-[600px]:inline-flex`.
      Exactly one is displayed at any width (boundary at 600px), and `display:none` drops the inactive one
      from the a11y tree so only one Clear is live per viewport.
    - **Hide the `draftHint` on phone** (`max-[599px]:hidden` on the hint span): the design's phone row 1
      shows only the "Draft to polish" label beside Clear, not the hint — keeps row 1 uncrowded.
  - Clear classes: reuse the exact #23 button from `OriginalCard.tsx:58-64`
    (`rounded-[4px] text-[12px] text-[var(--text-tertiary)] outline-none hover:text-[var(--text-color)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)]`),
    `type="button"`, label `t('polish.clear')`. The **phone** instance must hit **≥44px**: use
    `min-h-11 inline-flex items-center px-2` (NOT a bare `py-1.5`, which is ~24px) while keeping the quiet
    text style; the desktop instance keeps the compact #23 sizing.
  - **`!translating` is `draftTranslate`-streaming only.** In `PolishPanel`, `translating = dt.status
    === 'streaming'` (the `draftTranslate` op that mirrors into the draft). Clear is hidden ONLY during
    that. It **stays visible while the `polish` op streams** (the Draft is the polish *input*, not the
    polish stream's target) — clearing then resets/aborts the polish op. Do not gate Clear on `isPolishing`.

**Tests (RED first — write the failing assertions before the implementation):**

- `src/components/polish/DraftCard.test.tsx` — Clear shown when `value` non-empty AND not translating;
  hidden when empty; hidden when `translating`; click calls `onClear` and refocuses the textarea; label
  is `polish.clear`. Because the header dual-renders a phone + desktop Clear (one `display:none` per
  breakpoint, both present in jsdom), scope the query (e.g. `getAllByRole('button', { name: /clear/i })`
  and assert count / the intended instance) rather than a bare `getByRole`.
- `src/components/polish/PolishPanel.test.tsx` — `clearDraft` behaves as a **non-edit** action, asserted
  on **observable** outcomes (not just `debounce.cancel()`): with a draft present + auto-run **enabled**,
  clicking DRAFT Clear (a) empties the draft, (b) leaves the `polish` + `draftTranslate` ops idle, (c)
  shows **no** auto-run pending chip and — after advancing timers past the debounce — fires **no**
  provider run. Plus: clearing while the `polish` op is streaming resets it (Clear stays visible then).
- Clearing with a **draft lookup armed/open** (`polishDraft` owner): after clear, the draft is empty and
  the lookup is disarmed/closed (the `usePaneLookup` value-change effect handles empty text — assert it).

**Copy:** none — reuse the existing `polish.clear` key (added by #23). No `src/locales` change.

### Files OUT of scope

- `OriginalCard.tsx` (already has Clear from #23), `src/locales/**` (key reused), any store/provider/
  prompt logic. No new design surface beyond the committed `dev-docs/designs/lucid-draft-clear/` bundle.
- The `draftTranslate` / polish op engine, `usePanelRun`, `useAutoRunDebounce` — reused unchanged.

## Prior art / precedent / rejected alternatives

- **Prior art / precedent:** feature #23 (`dev-docs/designs/lucid-polish-clear/`,
  `dev-docs/plans/20260629-feature-23-polish-clear.md`) — the Original Clear. Its Gate-2 caught that
  routing Clear through `onChange('')` fires a debounced auto-polish; the fix was a dedicated non-arming
  `clearOriginal`. This plan copies that resolution exactly for the draft.
- **Rejected — reuse `onDraft('')` as the clear handler.** It calls `armPolish`, which under auto-run
  schedules a debounced re-polish on an empty draft. Chosen: a dedicated non-arming `clearDraft`.
- **Rejected — no `!translating` guard (copy Original's condition verbatim).** DraftCard is a streaming
  target; a Clear shown mid-stream would let the user wipe a draft the `draftTranslate` mirror is
  actively writing. The design mandates `!translating`; add the guard.
- **Rejected — a new i18n key.** The design says reuse `polish.clear`; a new key would fork the copy.
- **Rejected — a one-button insert (single Clear, single-row header).** Would overflow the busier DRAFT
  header on phone. The committed design reflows to two rows on phone (Gate-2 High). Chosen: the responsive
  two-row header above.
- **Rejected — wrap the whole right group to row 2 on phone (single Clear, `flex-wrap`).** Simpler, but
  it puts Clear on row 2 leading the controls, whereas the design keeps Clear on **row 1** with the label
  ("Clear keeps the first slot"). Rule 51 ("looks similar doesn't count") → the breakpoint-scoped
  dual-render that matches the design at both breakpoints.

## Work-item sequencing

Single WI (Small feature), behavioral (visible new control + reset behavior → browser-verified):

- **WI-1** — `clearDraft` in PolishPanel + `onClear`/Clear button in DraftCard + tests. ~1 small PR.

## Test catalogue

- `DraftCard.test.tsx`: visibility (non-empty+!translating shown; empty hidden; `draftTranslate`-translating
  hidden; **polish-streaming shown**), click → `onClear` + textarea refocus, label `polish.clear`; queries
  scoped for the dual-rendered phone/desktop Clear.
- `PolishPanel.test.tsx`: `clearDraft` as a non-edit action — empties draft, ops idle, **no pending chip
  + no provider run after timers advance** (auto-run enabled), and resets an in-flight polish op.
- lookup-armed-on-clear: clearing disarms/closes the `polishDraft` lookup.
- Existing polish suites stay green; 100% gated coverage held.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| **Phone header overflow / wrong reflow** (Gate-2 High) | Implement the design's two-row phone header (label+Clear row 1; controls row 2) via the breakpoint-scoped restructure above; Gate-5 CDP verifies at ≤599px (two rows, no overflow, Clear on row 1, ≥44px hit). |
| Clear arms a debounced re-polish under auto-run (#23's trap) | Dedicated non-arming `clearDraft` (no `armPolish`); test asserts **no pending chip + no provider run** with auto-run enabled. |
| Hiding Clear during a *polish* stream (wrong guard) | Gate visibility on `!translating` (= `draftTranslate` streaming) ONLY, never `isPolishing`; a test asserts Clear stays shown while polish streams. |
| Clear visible mid-`draftTranslate`-stream lets the user wipe a streaming draft | Visibility gated on `!translating` + a test for the translating case. |
| Focus lost / lookup left armed after clear | `handleClear` refocuses `lookup.textareaRef` (mirror #23); the `usePaneLookup` value effect disarms on empty — both tested. |
| RTL / dark regressions | Reuse #23's exact token classes; design depicts all 8 states; Gate-5 CDP checks dark + RTL (header mirrors, Clear leads). |

## Backward compat

Purely additive UI on an already-designed surface (a new header button). No data, API, persistence, or
i18n change (key reused). Nothing to migrate.

## Definition of Done (Gate 5)

- DRAFT Clear shown only when the draft is non-empty and not `draftTranslate`-streaming (stays shown
  during a polish stream); hidden otherwise; first slot of the desktop right group (parity with the
  Original Clear).
- Click wipes the draft, resets the polish result, does NOT fire an LLM call (verify no network request
  on Clear, even with auto-run enabled), and refocuses the textarea.
- **Phone (≤599px): header reflows to two rows** — label + Clear on row 1, Translate-original + ⌕ +
  language on row 2; no horizontal overflow; Clear hit area ≥44px.
- Light + dark + RTL (header mirrors, Clear leads) per the bundle.
- `pnpm check:all` green; evidence at `dev-docs/verification/feature-27-20260709.md`.

## Revision history

- v1 (2026-07-09) — initial plan.
- v2 (2026-07-09) — Gate-2 round 1 (Codex gpt-5.5/high) → **NEEDS REVISION**. Resolved: (High) added the
  design's two-row phone header restructure (was under-specified as a one-button insert); (Med) clarified
  `!translating` is `draftTranslate`-only so Clear stays visible during a polish stream; (Med) non-arming
  test now asserts observable behavior (no pending chip / no provider run / ops idle); (Low) added
  lookup-armed-on-clear coverage, RED-first sequencing, corrected the header line ref.
- v3 (2026-07-09) — Gate-2 round 2 (Codex gpt-5.5/high): High resolved; remaining were mechanical CSS
  refinements, all applied here (no 3rd Codex round needed): (Med) phone Clear uses `min-h-11 inline-flex
  items-center px-2` for a real ≥44px hit target (not `py-1.5` ≈24px); (Low) hide the `draftHint` on phone
  to match the design's row 1; (Low) clean inverse visibility (`min-[600px]:hidden` / `hidden
  min-[600px]:inline-flex`) to avoid the 599/600 fractional gap. **Gate-2 PASSED** — 0 open Crit/High/Med.

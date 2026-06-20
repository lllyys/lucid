# Feature #18 — Polish-goal selector (clarity / tone / grammar / concise)

Status: PLANNED (Gate 2 PASSED — v3, 0 open Crit/High/Med) · GH #145 · design: `dev-docs/designs/lucid-workspace`

## Problem
The polish flow gives the user no way to choose *how* the draft is refined — the goal is
**hardcoded** to `'clarity'` (`src/components/polish/PolishPanel.tsx:72`, the only production `goal:`
assignment). `PolishGoal = clarity | tone | grammar | concise` exists, the prompt builder already maps
each goal to an instruction (`POLISH_GOAL_INSTRUCTION`, `src/lib/prompts/index.ts:65-70`) and validates it
(`:150`), and the committed `lucid-workspace` design depicts a goal-chip row in the polish **control bar**
("Pick your goals and press Polish"). The chips were never built. User ask (triage 2026-06-20): "there
should be clear buttons for polishing."

## Decision — single-select v1 (one active goal, default `clarity`) — an ACCEPTED design deviation
The committed design is **multi-select** (`state.goals: string[]`, `toggleGoal` add/remove, plural copy
"Pick your **goals**" — design lines 262/336-341/405). **v1 ships single-select** — this is explicitly an
**accepted design deviation for v1**, NOT a "design-faithful subset", for two reasons:
- **Coherent prompts.** The goal instructions conflict when combined — `grammar` says "Correct grammar …
  **do not otherwise rewrite**" while `clarity`/`tone`/`concise` all rewrite (`index.ts:65-70`).
  Multi-select would let the user pick a contradictory set → an incoherent combined prompt.
- **Minimal blast radius.** Keeps `PolishRequest.goal: PolishGoal` (single) — **no type-shape change**,
  **no prompt-builder change** (it already does `POLISH_GOAL_INSTRUCTION[req.goal]`).

The chip *surface* and its control-bar placement ARE in the committed bundle (rule 51 satisfied for the
surface); only the **selection cardinality** (single vs multi) deviates. **Copy divergence flagged for the
user:** the design label is "goals" (plural); v1 uses `polish.goal.label` = "Goal" (singular) to match
single-select. Multi-goal is a documented follow-up (Known limitations). If the user wants the full
multi-select design now, that's a re-scope, not a silent default.

## Surface area (file-by-file)
- **NEW `src/components/polish/GoalChips.tsx`** — presentational single-select chip row.
  Props: `{ value: PolishGoal; onChange: (g: PolishGoal) => void; disabled?: boolean }`.
  - **a11y (single-select):** container `role="radiogroup"` + `aria-label={t('polish.goal.label')}`; each
    chip a `<button role="radio" aria-checked={g === value}>` with **roving tabindex** (only the active
    chip is `tabIndex 0`) and arrow-key navigation (←/→ move + select, **wrapping** at the ends — ← on the
    first selects the last, → on the last selects the first — per the radiogroup pattern). NOT
    `aria-pressed` (that models independent toggles = the multi-select mental model). Visible focus
    (rule 33): `focus-visible:outline-2 outline-[var(--accent-ink)]`.
  - **order/style:** render in the **design's** order via a local `const GOAL_ORDER: PolishGoal[] =
    ['clarity','grammar','tone','concise']` — NOT `POLISH_GOALS` (`src/providers/types.ts:13`, which is
    `clarity, tone, grammar, concise` → would swap the middle two vs the design's `clarity, grammar, tone,
    concise`). One pill per goal; active pill = accent border/bg per design `chip(on)`
    (`rounded-full px-[13px] py-1.5 text-[12.5px] border …`), tokens-only; labels via `t('polish.goal.<key>')`.
  - Own file so `PolishPanel.tsx` stays < 300 lines.
- **`src/components/polish/PolishPanel.tsx`**:
  - `const [goal, setGoal] = useState<PolishGoal>('clarity')`.
  - **Placement (honest about a layout divergence):** the design puts the goal chips in a single shared
    top-level **control bar** (mode-switcher + language pair + provider + Run, design lines 46-140) that
    the lucid layout **never implemented** — `Workspace.tsx:45-48` stacks `<TranslatePanel/>` over
    `<PolishPanel/>` (both visible at once) and `WorkspaceToolbar` holds only the `ProviderSwitcher`. There
    is no exact design host. Render `<GoalChips value={goal} … disabled={isPolishing} />` in the
    PolishPanel's own **header row** (`~182-215`, alongside the AutoRunToggle / Polish button) — the closest
    available analog. Rule 51 is satisfied for the chip *component* (the bundle depicts a goal-chip row);
    the exact host is a reasonable analog given the divergence, **not** a bundle-endorsed spot. **NOT** the
    Draft card header (`DraftCard.tsx`).
  - **`buildPolishRequest` gains a `goal` override:** add `goal?: PolishGoal` to its `over` param type and
    set `goal: over.goal ?? goal` (replacing the hardcoded `'clarity'`). Manual Polish already reads the
    latest `goal` via the render closure.
  - **`onChangeGoal(g)` handler** (mirrors `onDraft`/`onTgtLang` fresh-value pattern, `:147-161`):
    `setGoal(g)` → `resetPolish()` (a showing result was computed under the OLD goal; invalidate it so a
    stale diff/Accept can't survive — mirrors the keywords-change effect `:103`) → `armPolish(buildPolishRequest({ goal: g }))`
    with the **just-received `g`** (not the stale state). Route through `armPolish` (NOT `debounce.scheduleRun`
    directly) so it inherits the `auto.armed` + `!translating` + min-chars guards.
- **`src/locales/en/translation.json`** — add `polish.goal.label` ("Goal"), `polish.goal.clarity`
  ("Clarity"), `polish.goal.tone` ("Tone"), `polish.goal.grammar` ("Grammar"), `polish.goal.concise`
  ("Concise").

### Files OUT of scope
- `src/providers/types.ts` (`PolishGoal`/`PolishRequest` unchanged — single goal).
- `src/lib/prompts/index.ts` (already handles a single goal; untouched).
- `DraftCard.tsx`, the translate pane, diff/accept-reject, result pane, Keywords, sync/persistence.
- Persisting the chosen goal across reloads (local component state for v1).

## Prior art / precedent / rejected alternatives
- **Precedent:** the `LanguagePicker`/segmented patterns in the polish pane; `POLISH_GOAL_INSTRUCTION`
  already exists; the `over`-override + fresh-value-into-`armPolish` pattern (`onDraft`/`onTgtLang`).
- **Rejected — multi-select now:** contradictory combined prompts + a `goal → goals[]` type-shape change
  rippling through the builder/validation/every request construction. Deferred.
- **Rejected — a new Zustand store for the goal:** unnecessary for v1; local state suffices and avoids
  persistence/sync scope. (A `polishGoalsStore` is the natural home if persistence is added later.)
- **Rejected — `aria-pressed` toggle chips:** wrong a11y model for a mutually-exclusive choice.

## Work-item sequencing
- **WI-1 (behavioral · FINAL · minor bump) — the goal-chip selector.** `GoalChips.tsx` + PolishPanel
  state/wiring (`buildPolishRequest` override + `onChangeGoal` reset+arm) + i18n + tests. One PR.
  ~150-200 LOC incl. tests.

## Test catalogue
- **`src/components/polish/GoalChips.test.tsx`** (RTL, behavior): renders 4 chips by ARIA name; container
  is `radiogroup`; the `value` chip has `aria-checked=true` and the rest false; clicking a chip fires
  `onChange` with that goal; arrow-key moves selection (roving focus); chips disabled when `disabled`.
- **`src/components/polish/PolishPanel.test.tsx`** (extend):
  - default goal is `clarity` (behavior unchanged when no chip clicked).
  - selecting a goal then manual Polish builds the request with that `goal` (assert via the mocked
    run/provider boundary, not wording).
  - **auto-run carries the NEW goal:** with auto-run on + draft text, changing the goal arms a run whose
    request `goal` is the just-selected one (NOT the stale `clarity`) — guards against the H1 regression.
  - **stale-result reset (H2):** changing the goal while a polish result is showing clears it
    (`resetPolish`), so a diff/Accept computed under the old goal can't be accepted.
  - **disabled while streaming:** clicking a chip while `isPolishing` does not arm/run.
  - **empty draft:** changing the goal with no draft text does not arm (min-chars guard).
- **i18n presence:** a test asserting all five `polish.goal.*` keys resolve — assert `t(key) !== key` (a
  missing key returns the key string, so the check isn't a no-op; the suite imports `@/i18n` + real `t()`).

## Risks + mitigations
- **Auto-run goal-change path (H1):** must build the request with the fresh goal + route through
  `armPolish`. Mitigated by the explicit `buildPolishRequest({ goal: g })` + the new-goal test.
- **Stale result/Accept (H2):** `resetPolish()` on goal change. Mitigated + tested.
- **Layout/regression (#13 #7):** the chip row adds height to the control row. Verify via CDP it doesn't
  overflow or re-break alignment; tokens-only.
- **Design deviation (single vs multi):** accepted for v1 + surfaced to the user (above); Gate-2 confirmed
  acceptable.

## Backward compat
No type/persistence change. Existing polish runs default to `clarity` (current behavior) until a chip is
clicked. No migration. Older sessions/data unaffected.

## Verification (Gate 5)
Behavioral · FINAL WI → **slice + full acceptance**. Browser-verify via CDP (`pnpm dev` / built app): the
control-bar chip row renders, single-select works (one active), selecting a goal then Polish uses that
goal, default clarity unchanged, no layout overflow. **Gate 5b:** write
`dev-docs/verification/feature-18-<YYYYMMDD>.md` (SCHEMA.md) before flipping the row to VERIFIED
(`check_terminal_status_evidence.sh` enforces).

## Known limitations (accepted for v1)
- **Multi-goal selection deferred** (design depicts it; v1 single-select for coherent prompts). Follow-up
  if the user wants the full design.
- **Goal not persisted** across reloads (local state). Follow-up if desired.

## Audit fixes applied (Gate 2, round 1 → v2)
Independent Claude auditor (Codex quota-blocked; rule-48 separate context), round 1 = NEEDS REVISION
(0 Crit · 2 High · 3 Med). All addressed in v2:
- **H1** auto-run goal path infeasible as written → specified `buildPolishRequest` `goal` override +
  explicit `armPolish(buildPolishRequest({ goal: g }))` with the fresh value + a new-goal test.
- **H2** missing `resetPolish()` on goal change (stale result/Accept) → added to `onChangeGoal` + a test.
- **M3** chip placement in the Draft card header contradicted the design → corrected to the polish
  control bar (design lines 88-96).
- **M4** "design-faithful subset" overstated → re-framed as an accepted design deviation + flagged the
  singular-"Goal" vs plural-"goals" copy divergence for the user.
- **M5** `aria-pressed` wrong for single-select → `role="radiogroup"`/`role="radio"`/`aria-checked` +
  roving focus.
- **Lows** routed goal-change through `armPolish` (inherits `!translating` guard); added disabled-while-
  streaming / empty-draft / i18n-presence / default-clarity tests; added the Gate-5b verification line.

## Revision history
- v1 (2026-06-20) — initial draft.
- v2 (2026-06-20) — Gate-2 round-1 fixes applied (2 High + 3 Med).
- v3 (2026-06-20) — Gate-2 round-2 fixes: M-NEW-1 (explicit `GOAL_ORDER` design order, not `POLISH_GOALS`),
  M-NEW-2 (placement reframed as the closest analog given the no-shared-control-bar layout divergence),
  + lows (i18n-presence `t(key)!==key`, arrow-key wrap). **Round-2 verdict: 0 open Crit/High/Med → READY
  TO BUILD; Gate 2 closed.**

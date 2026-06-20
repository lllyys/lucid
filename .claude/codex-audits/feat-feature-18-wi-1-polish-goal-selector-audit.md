---
branch: feat/feature-18-wi-1-polish-goal-selector
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-20
---

# Gate-4 audit — feature #18 WI-1 (polish-goal selector)

Independent Claude auditor (Codex quota-blocked; rule-48 separate context), read-only, against plan v3
(Gate-2-passed). One round → **ship-as-is, 0 open Critical/High/Medium**.

## Scope
- `src/components/polish/GoalChips.tsx` (+ test) — NEW single-select radiogroup of goal chips.
- `src/components/polish/PolishPanel.tsx` (+ test) — `buildPolishRequest` goal-override + `onChangeGoal`.
- `src/locales/en/translation.json` — `polish.goal.*` keys.

## Verified (all PASS)
1. **Correctness vs plan.** `buildPolishRequest` takes `goal?: PolishGoal` → `goal: over.goal ?? goal`;
   the hardcoded `'clarity'` is gone (default now only in `useState<PolishGoal>('clarity')`). `onChangeGoal(g)`
   = `setGoal(g)` → `resetPolish()` → `armPolish(buildPolishRequest({ goal: g }))` with the **fresh** `g`.
   Chip order is the design's `['clarity','grammar','tone','concise']` (NOT `POLISH_GOALS`).
2. **a11y (Gate-2 M5).** `role=radiogroup` + `aria-label`; chips `role=radio` + `aria-checked` + roving
   `tabIndex` (active=0) + arrow-key move/select with wrap + `focus-visible` outline; focus follows
   selection via the `btns` ref. No `aria-pressed` leftover.
3. **Async/state.** The `resetPolish()`-before-`armPolish` ordering is load-bearing + correct (reset bumps
   `runId`; scheduleRun captures the post-reset id + re-validates at fire). `armPolish` reads
   `translating`/`auto.armed` fresh via closure. Goal change during in-flight polish blocked (chips
   `disabled={isPolishing}`; arrow keys can't reach disabled buttons). Unconditional `resetPolish()` on an
   idle op is harmless.
4. **No regression.** New optional `goal?` is backward-compatible (existing callers omit → `?? goal`).
   Chip row is a new header sibling, NOT the DraftCard. Manual/auto/translate flows untouched.
5. **Test quality (behavior-asserting).** GoalChips tests via ARIA roles/names (4 radios in design order,
   aria-checked, click→onChange, arrow-wrap both ways, roving tabindex, disabled). PolishPanel covers the
   two regression guards — **auto-run-carries-NEW-goal** (H1, via a capturingProvider sink asserting
   `goalOf(sink.req)==='grammar'` — fails if wiring used stale state or bypassed `armPolish`) and
   **stale-result-reset** (H2) — plus default-clarity, manual-carries-goal, empty-draft-no-arm.
6. **lucid compliance.** No `any` (typed `Partial<Record<PolishGoal,…>>` ref); tokens-only (zero hex);
   GoalChips 61 lines, PolishPanel 281 (<300); all five `polish.goal.*` keys present, flat camelCase.

## Findings
- None Critical/High/Medium. Two Lows, both already-mitigated/informational:
  - GoalChips: no Home/End handling (optional in the WAI-ARIA radiogroup pattern; not required) — accepted.
  - The visible "Goal" label + radiogroup `aria-label` both resolve `t('polish.goal.label')` — double-
    announce correctly avoided (the visible span is `aria-hidden`) — verified, no action.

## Gate-5
Behavioral FINAL WI → CDP browser-verified (the "Goal" radiogroup renders with Clarity/Grammar/Tone/Concise
in design order, Clarity default-checked, single-select on click, zero console errors). Full Gate-5b
acceptance evidence: `dev-docs/verification/feature-18-20260620.md` (post-merge, before the VERIFIED flip).

## Verdict
ship-as-is.

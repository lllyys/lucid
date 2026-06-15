---
branch: chore/triage-design-gaps
threadId: 019ec92d-6bf3-76e3-9444-56a00a110a28
rounds: 3
final_verdict: follow-up-recommended
date: 2026-06-15
---

# Gate-4 audit — feature #2 (Lucid Workspace) on `chore/triage-design-gaps`

Independent Codex audit (gpt-5.5, high effort, read-only sandbox) of PR #20, which
bundles the full feature #2 implementation (9 WIs, VERIFIED v0.2.0), the rule 53/60
reconciliation, and the revised design bundle that resolves needs-design #13–#18.

Codex thread lineage (one `codex exec` session resumed across rounds):
`019ec918` (round 1) → `019ec929` (round 2) → `019ec92d` (round 3).

Author/auditor separation (rule 48): the implementing Claude Code session authored the
code; Codex audited it as a separate process. Maintained across all three rounds.

## Round 1 — `019ec918` — verdict: block-recommended

Two primary workflows were incorrect:

| # | file | severity | issue | resolution |
|---|------|----------|-------|------------|
| H1 | `src/components/polish/PolishPanel.tsx` | High | Editing the Original/Draft/language inputs did not reset or abort the in-flight "Translate original" (`draftTranslate`) op, and there was no Stop control. A `useEffect` mirrors the draftTranslate stream into the editable draft, so a stale/superseded stream could overwrite newer user input. | FIXED — see below |
| H2 | `src/components/translate/TranslateResult.tsx` | High | The Accept button was a false-success no-op: it fired a confirmation toast but never committed the translation anywhere (violates rule 66 §2). | FIXED — see below |

Low findings deferred as accepted follow-ups (rule 47 Gate-4 — Low findings may be
accepted with rationale). None block the merge; each is a polish/refactor item, not a
correctness defect:

- `src/hooks/useElapsedTimer.ts` — a defensive branch that is effectively dead given the
  store's invariants. Rationale: harmless; removing it needs a focused test to prove the
  invariant. Deferred.
- `src/lib/polish/wordDiff.ts` — fence detection handles 3-backtick fences; 4-backtick
  and `~~~` tilde fences are not special-cased. Rationale: uncommon in practice; the
  whole-replace fallback keeps output correct, only the diff granularity degrades.
  Deferred (track against rule 66 §1 structure-preservation hardening).
- `src/components/polish/KeywordsCard.tsx` — `MAX_KEYWORDS`/`MAX_KEYWORD_CHARS` are
  enforced in the prompt builder but there is no UI affordance signalling the limit.
  Rationale: a new visible affordance is design-gated (rule 51); cannot be invented here.
  Deferred to a `needs-design` follow-up if pursued.
- `src/providers/base.ts` — the `streamOp` retry/fallback block could be extracted for
  reuse. Rationale: pure refactor, no behavior change. Deferred.
- hardcoded `text-white` on the run buttons instead of an on-accent token (rules 31/34).
  Rationale: cosmetic; the buttons render correctly in both themes. Deferred to a token
  pass.
- a few `aria-label`s pass literal strings rather than `t(...)` (rule 66 §5). Rationale:
  low-traffic controls; no user-visible English copy regression. Deferred to an i18n pass.
- `FooterPrivacy` shows the vendor but not the active model. Rationale: display nicety.
  Deferred.

## Round 2 — `019ec929` — verdict: block-recommended

- **H2 confirmed CLOSED.** "Accept now commits panel-local state, clears correctly, and
  reflects acceptance. The direct input reset, runId guard, Stop control, focus behavior,
  and i18n keys are sound."
- **New High found (same workflow, third interleaving):**
  `src/components/polish/PolishPanel.tsx` | High | "Translate original" can run while an
  old Polish result is still actionable. Accepting that result did not reset
  `draftTranslate`, so its next mirrored chunk overwrites the just-accepted draft.

## Round 3 — `019ec92d` — verdict: ship-as-is

> "No findings. The remaining High is closed by resets at `PolishPanel.tsx:53` and
> `PolishPanel.tsx:99`, backed by the `runId` guard at `operationStore.ts:96`.
> final_verdict: ship-as-is — stale Polish acceptance and post-accept translation
> overwrite paths are eliminated."

(Codex's focused-test run was blocked by the read-only sandbox; tests were run by the
implementing session instead — see below.)

## Fixes applied (this PR)

- **H1 — stale draftTranslate overwrite via input edits / no Stop:**
  `PolishPanel.onOriginal/onDraft/onSrcLang/onTgtLang` now call `resetForInput()` which
  resets BOTH `polish` and `draftTranslate` (`operationStore.reset` drops+aborts the
  controller and bumps `runId`, so the in-flight `run` loop sees `isStale()` and stops). A
  new `onStopTranslate()` calls `abort('draftTranslate')`; `DraftCard` renders a Stop
  button (`t('polish.stopTranslate')`) beside the "translating…" note.
- **H2 — Accept no-op:** `TranslateResult` now takes `{ accepted, onAccept }`; Accept calls
  `onAccept(op.text)`. `TranslatePanel` holds `acceptedText`, commits it in `onAccept`
  (and clears it on run/sourceChange/swap/clear), and flips the label to
  `t('common.accepted')` ("Accepted ✓") once committed.
- **Round-2 High — accept-during-translate overwrite:** `onTranslateOriginal()` now resets
  `polish` before starting the translation (a fresh translation invalidates the stale
  polish result, so its Accept disappears), and `onAccept()` now calls `resetForInput()`
  (stops any in-flight draftTranslate before committing). With the Polish run button
  already disabled while translating, no UI path remains where the polish Accept is
  clickable during a live `draftTranslate`.

## Regression tests added

- `TranslatePanel.test.tsx` — "Accept commits the translation and reflects the accepted
  state" (asserts the committed "Accepted ✓" state + the toast).
- `PolishPanel.test.tsx` — "editing the draft mid-translate aborts the stale stream so it
  cannot overwrite the edit"; "shows a Stop control while translating the original and
  aborts it on click"; "starting Translate original clears a prior polish result so it
  cannot be accepted mid-translate".

## Verification

`pnpm check:all` GREEN: lint clean, 356 tests passing, 100% coverage
(statements/branches/functions/lines), production build OK.

## Summary verdict

All Critical/High/Medium findings resolved across 3 rounds. Remaining items are Low
follow-ups, accepted with rationale above (not filed as separate bugs — each is a
polish/refactor item, and the visible-affordance ones are design-gated under rule 51).
**final_verdict: follow-up-recommended.**

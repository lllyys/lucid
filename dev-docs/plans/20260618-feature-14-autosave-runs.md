# Feature #14 — Auto-save every completed translate/polish run to session history

- **Status:** PLANNED (Gate 2 pending)
- **GH:** #98
- **Tracker row:** `docs/features.md` #14 (Medium)
- **Slug:** autosave-runs

## Problem

Session/task history is saved only on **Accept** (`recordTask` is called in `TranslatePanel.tsx:59`
`onAccept` and `PolishPanel.tsx:106`'s accept handler). A translate/polish run the user doesn't
explicitly Accept never appears in the Sessions sidebar — which stays "Nothing saved yet" despite the
empty-state copy promising "Sessions and their tasks will appear here **as you translate and polish**."
User decision (2026-06-18 triage): **auto-save every completed run to history, no Accept needed.**

## Surface area (file-by-file)

### `src/lib/sessions/autoRecord.ts` (new — coverage-gated; the load-bearing decision logic)
The decision + dedup live here (NOT in the hook), matching the precedent that `recordTask` is a
`src/lib/sessions/` function, and so the 100%-coverage gate (`src/lib/**`) covers it.

```ts
import type { PanelId, PanelOp } from '@/stores/operationStore'
import { recordTask } from './recordTask'
import type { Task } from '@/stores/sessionStore'

// Last-recorded runId per panel, MODULE-scoped (survives a component remount / StrictMode
// double-invoke — a per-instance useRef does NOT, which would double-record). Reset via the test seam.
const lastRecorded = new Map<PanelId, number>()
export function __resetAutoRecord(): void { lastRecorded.clear() }

/** Record a COMPLETED run once per (panel, runId). Returns true iff it recorded. */
export function recordRunIfNew(
  panelId: PanelId,
  op: PanelOp,
  kind: Task['kind'],
  sourceText: string,
  cleanResult?: (raw: string) => string,
): boolean {
  if (op.status !== 'done') return false            // narrows the union → op.text is now valid (fixes the type-unsound read)
  if (lastRecorded.get(panelId) === op.runId) return false
  if (sourceText.trim() === '') return false
  const result = cleanResult ? cleanResult(op.text) : op.text
  if (result.trim() === '') return false
  lastRecorded.set(panelId, op.runId)
  recordTask(kind, sourceText, result)
  return true
}
```
- `op.text` is read ONLY after `op.status !== 'done'` early-returns → the `OperationState` union
  narrows to the `done` member (which carries `text`); type-sound under strict TS (fixes Gate-2
  Critical-1: `idle` has no `text`).
- The dedup key is the MODULE map (not a per-component ref) → survives remount/StrictMode (fixes the
  Gate-2 StrictMode double-record gap). `runId` is monotonic per panel — bumped by `run` AND by
  `reset`/`abort`/`fail` (`operationStore.ts:67/74/80/90`), initial `0`, first run `1` — so a key never
  repeats and the guard is collision-free.

### `src/hooks/useAutoRecordTask.ts` (new — thin wrapper)
```ts
export function useAutoRecordTask(panelId, kind, sourceText, cleanResult?): void
```
- Reads `useOperationStore((s) => s[panelId])`.
- `useEffect(() => { recordRunIfNew(panelId, op, kind, sourceText, cleanResult) }, [op.status, op.runId,
  sourceText, panelId, kind, cleanResult])` — deps INCLUDE `sourceText` (+ the stable args) so
  exhaustive-deps is satisfied and the recorded source is the value at the `done` render (the panel
  re-renders with fresh `source`/`draft` when `op` flips to `done`); the module-map dedup makes the
  extra re-runs harmless (records once per runId regardless).

### `src/components/translate/TranslatePanel.tsx` (modified)
- `useAutoRecordTask('translate', 'translate', source)` (no clean — translate output is the literal result).
- **Remove** `recordTask(...)` from `onAccept` (line 59). `onAccept` keeps `setAcceptedText(text)` +
  `notify(...)` — Accept now only commits the chosen result to the working editor; history is the
  auto-saved completed run.

### `src/components/polish/PolishPanel.tsx` (modified)
- `useAutoRecordTask('polish', 'polish', draft, cleanPolishOutput)` — the saved polish result is the
  **cleaned** text (feature #96), so history never stores model prose.
- **Remove** `recordTask(...)` from the accept handler (line 106). Accept keeps committing the
  (possibly per-hunk-edited) result to the draft.
- **Explicit semantics change (Gate-2 Medium-4):** today Accept records the per-hunk-EDITED text; after
  this change history stores the **full cleaned model result** of the run (a user who rejects some hunks
  and Accepts gets the full result in history, their curated version in the draft). This is the intended
  reading of "every completed run" — the run's output is logged; Accept curates the editor. Locked by a
  test asserting the auto-saved polish equals `cleanPolishOutput(op.text)`, NOT the post-hunk-edit text.

### Files OUT of scope
- `src/lib/sessions/recordTask.ts` — unchanged (its create-session-if-none + title derivation already
  fit; its tests stand).
- `draftTranslate` panel-op — NOT auto-saved (it's an editor helper that seeds the polish draft, not a
  user-facing translate/polish result).
- **No new UI surface** — the Sessions sidebar (feature #3, designed) just shows more tasks; the
  empty-state copy becomes accurate. **Not rule-51 gated** (no toggle: the user chose always-on; no new
  control/indicator/state).
- `operationStore` — unchanged (editing source already calls `reset()` → `idle`, so a stale `done` with
  outdated text never lingers; auto-save fires only at the `done` transition).

## Prior art / project precedent / rejected alternatives
- **Precedent:** `recordTask` is the existing decoupling seam (panels → sessionStore). `PolishResult`
  already uses a `useEffect` keyed on `runId` (`setRejected(new Set())`) — the same once-per-run pattern.
- **Rejected — trigger in `usePanelRun`/`operationStore`:** the kind + polish-result cleaning are
  panel-specific, and `operationStore` must not import `sessionStore` (the `recordTask` seam exists
  precisely to keep that decoupled). Panel-level is correct.
- **Rejected — keep Accept-recording AND add done-recording:** would double-record (one task on done,
  one on accept). Accept-recording is removed; Accept narrows to "commit to editor."
- **Rejected — dedup identical consecutive runs:** the user asked for *every* completed run; per-run
  recording (one task per `runId`) is the intent. Empty-result/empty-source runs are skipped; that's the
  only suppression.

## Work-item sequencing
- **WI-1 (final, behavioral, ~1 small PR):** the `useAutoRecordTask` hook + wire into both panels +
  remove the two accept-recordings + tests. Single cohesive change → completes the feature → **minor**
  bump (0.8.0 → 0.9.0).

## Test catalogue
- `src/lib/sessions/autoRecord.test.ts` (new, **coverage-gated** — the load-bearing logic): `recordRunIfNew`
  records once on `done` (asserts `useSessionStore` gained a task with the right kind/source/result);
  returns false + records nothing on `streaming`/`error`/`cancelled`/`idle`; dedups per `(panel, runId)`
  (second call same runId → false, one task); records again on a NEW runId; tracks `translate` vs
  `polish` panels INDEPENDENTLY (a translate runId doesn't suppress a polish run with the same number);
  skips empty/whitespace source; skips empty result (empty `op.text`); applies `cleanResult` (polish
  prose → the cleaned sentence is what's stored, NOT the raw); `__resetAutoRecord()` clears the map.
  Reset `useSessionStore` + `__resetAutoRecord()` in `beforeEach`.
- `src/hooks/useAutoRecordTask.test.tsx` (new, `renderHook`): on an op→`done` transition the hook records
  a task; **freshness** — the recorded `sourceText` is the value present at the `done` render (Gate-2
  High-2); no double-record on a re-render while `done`.
- `src/components/translate/TranslatePanel.test.tsx` (update): replace the "onAccept records a task"
  assertion with "a completed run auto-records exactly one task" + "Accept does NOT additionally record."
- `src/components/polish/PolishPanel.test.tsx` (update): same shift; assert the auto-saved polish result
  is `cleanPolishOutput(op.text)` (full cleaned result), NOT the per-hunk-edited accepted text.

## Risks + mitigations
- **History spam from rapid re-runs:** per-`runId` recording is the intended behavior (the user wants
  every run); empty-result/source skipped. **Precondition (Gate-2 Medium-6):** #14 is safe ONLY while
  **every run is user-initiated** (one deliberate Run/Polish click = one `done` = one task). **#11
  (auto-run) invalidates that precondition** — it would fire a run per keystroke-settle → a task per
  settle. #11 (design-gated, not landing first) MUST add debounce + save-only-final + dedupe before it
  ships. Documented here + on both GH issues.
- **Dedup must survive remount/StrictMode (Gate-2):** the dedup key is a MODULE-scoped
  `Map<PanelId, number>` in `autoRecord.ts`, not a per-component `useRef` — so a panel unmount/remount or
  a StrictMode double-invoke can't reset it and double-record. `runId` is globally monotonic per panel
  (bumped by run/reset/abort/fail), so keys never repeat.
- **Stale source:** auto-save uses the panel's current `source`/`draft` at the `done` transition — same
  as the existing Accept-recording. Editing source calls `operationStore.reset()` → `idle`, so a `done`
  op never lingers with text that mismatches an edited source. No new staleness vs today.
- **Double-record:** removing the accept-recording is load-bearing — a test asserts a run produces
  exactly one task (not two on done+accept).
- **Polish prose in history:** the saved polish result is `cleanPolishOutput(op.text)` (#96), so history
  stores the clean sentence.

## Backward compat
Additive — existing saved sessions/tasks are untouched; the change only adds more tasks going forward.
Accept still commits to the editor (its history side-effect moves to auto-save). No persisted-data shape
change.

## Revision history
- 2026-06-18 v1 — initial plan (Gate 1).
- 2026-06-18 v2 — Gate 2 audit (independent Claude auditor, round 1; Codex quota-blocked). Verdict
  NEEDS REVISION (1 Critical + 2 High + 4 Medium) → all resolved in v2:
  - **Critical-1** (type-unsound `op.text` read on the `idle` union member): the read now lives in
    `recordRunIfNew` AFTER the `op.status !== 'done'` early-return, so TS narrows the union. Fixed.
  - **High-2** (stale-closure deps): the hook's effect deps now INCLUDE `sourceText` (+ stable args);
    a freshness test asserts the recorded source = source-at-done. Fixed.
  - **High-3** (dedup soundness): documented that `runId` is bumped by run/reset/abort/fail (not just
    run) → globally monotonic per panel → collision-free guard. Fixed (doc).
  - **Medium-4** (polish history = full result, not per-hunk-edited): made explicit + locked by a test.
  - **Medium-5** (load-bearing logic in un-gated `src/hooks`): extracted `recordRunIfNew` to
    `src/lib/sessions/autoRecord.ts` (coverage-gated), hook is a thin wrapper. Fixed.
  - **Medium-6 + StrictMode-remount** (per-`useRef` dedup doesn't survive remount): dedup moved to a
    MODULE-scoped `Map<PanelId, number>` in `autoRecord.ts` (survives remount/StrictMode); #11
    precondition made explicit. Fixed.
  - Auditor verified all model assumptions against source (recordTask/Task/PanelId/PanelOp/
    cleanPolishOutput, both reset paths, runId monotonicity). Zero open Critical/High/Medium after v2.

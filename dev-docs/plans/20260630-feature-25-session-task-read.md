# Feature #25 — Read a recorded session task

Status: Gate 2 (v2, audited round 1) · GH #211 · design `dev-docs/designs/lucid-session-task-read/` (resolves #212) · mirrors the Starred detail (#22) + reuses #24 `loadSource`

## Problem
A session's tasks render as **truncated titles** in a non-interactive `TaskRow` (`SessionsView.tsx:144`). The
`Task` model stores the full `sourceText` + `resultText` and syncs/restores, but nothing renders them — so a
restored session is visible yet **unreadable** (user report: "sessions are restored but cant be read").

## Design (committed bundle)
A **read-only task detail** layer inside the Sessions sidebar (mirrors the Starred detail #22): the row body
opens the read view; a sibling `↗` Open-in-workspace button (reuses #24 `loadSource`) loads the task back into
the editor. Read view = back link + pinned header + Source/Result (translate) | Original/Polished/Keywords
(polish) + a sticky **Copy result** + **Open in workspace ›** action row.

## Data gap + the sync truth (drives WI-1 + WI-2 — Gate-2 r1 H1/H2)
The design header/blocks show direction ("中→EN"), latency ("1.5s"), and polish "Keywords kept" — none stored on
`Task` today. Capturing them requires care on TWO axes the r1 audit corrected:

| Element | Stored? | Source (verified) | Decision |
|---|---|---|---|
| `sourceText`/`resultText`, `kind`, `createdAt`(age) | ✅ | — | render directly |
| direction | ❌ | langs live ONLY at panel call sites (`labels.srcCode/tgtCode` TranslatePanel, `srcLang/tgtLang` PolishPanel) — NOT on `op`/`recordRunIfNew` (H2) | add optional `sourceLang?`/`targetLang?`, **threaded through `useAutoRecordTask` from the panels** (translate only — design has no polish direction). Read view derives the bidi `dir` via **`resolveBidiDirection(sourceText,'auto')`** (`bidi.ts`, returns `'ltr'|'rtl'`) — NOT `detectDirection` (which returns the translation ROUTE `zh-en|en-zh`, useless as a bidi dir → r2 M) |
| latency | ❌ | **`op.elapsedMs`** is frozen at the `done` transition (operationStore.ts:116) — already on the `op` `recordRunIfNew` receives (M7) | capture `durationMs: op.elapsedMs ?? undefined` |
| polish "Keywords kept" | ❌ | the polish keyword store, at the panel | add optional `keywords?: string[]`, threaded from PolishPanel (polish only) |
| "result not saved · interrupted run" | resultText may be '' | — | render the missing-result edge |

**Two backward-compat constraints (both load-bearing):**
1. **NO `PERSIST_VERSION` bump (H4).** The fields are additive-optional → old persisted v2 data is already
   structurally valid (absent === `undefined`). Bumping 2→3 would route stored v2 through neither migrate branch
   → `undefined` → **wipe all history** (and break `migrateSessions(state,2)===state`). Just add the optionals
   to `Task` + `addTask`'s `Omit<…>` input.
2. **Sync is IN scope (H1).** `flattenLocal` (seed.ts:43-50) + `entityToTask` (reconstruct.ts:40-52) are field
   **allow-lists** — without extending them the new fields (a) never sync AND (b) are **clobbered locally on the
   next `runSyncCycle`** (reconcile rebuilds the device's own task from the stripped projection). Since the user
   report is about *restored* tasks, omitting this makes the metadata vanish for the primary use case. Mirror the
   `entityToStarred` optional-field pattern (reconstruct.ts:71-100, `ipa/meaning/context` guards).

## Surface area (file-by-file)
### WI-1 (foundational · patch) — capture the metadata
- **`src/stores/sessionStore.ts`** — `Task` gains optional `sourceLang?: string`, `targetLang?: string`,
  `durationMs?: number`, `keywords?: string[]`. `addTask`'s `Omit<Task,'id'|'createdAt'|'updatedAt'|'deletedAt'>`
  input gains them. **No `PERSIST_VERSION` bump** (H4). (gated 100% + TDD-hook.)
- **`src/lib/sessions/recordTask.ts`** (M5 — was missing) — extend `recordTask(kind, sourceText, resultText)` to
  accept + forward the optional metadata to `addTask`.
- **`src/lib/sessions/autoRecord.ts`** — `recordRunIfNew` captures `durationMs: op.elapsedMs ?? undefined` (M7)
  and forwards the langs/keywords it now receives.
- **`src/hooks/useAutoRecordTask.ts`** — signature gains optional `meta?: { sourceLang?; targetLang?; keywords? }`
  (threaded to `recordRunIfNew` → `recordTask`). **Effect-dep hygiene (r2 L-b):** spread the primitive meta fields
  into the effect deps (or memoize `meta`) rather than depending on a fresh object literal — the
  `recordRunIfNew` module-map dedup makes extra runs idempotent regardless, but avoid needless every-render runs.
- **`src/components/translate/TranslatePanel.tsx`** (H2 — now IN scope) — pass `{ sourceLang, targetLang }` (the
  `labels.srcCode/tgtCode`) into `useAutoRecordTask`. **Move the `labels` computation ABOVE the
  `useAutoRecordTask` call (r2 L-d)** — today `labels` is computed after it.
- **`src/components/polish/PolishPanel.tsx`** (H2 — now IN scope) — pass `{ keywords }` (the polish keyword
  values, `keywordValues`) into `useAutoRecordTask`.

### WI-2 (foundational · patch) — sync round-trip the metadata (H1)
- **`src/lib/sync/seed.ts`** (`flattenLocal`) — add the 4 optional fields to the task entity payload.
- **`src/lib/sync/reconstruct.ts`** (`entityToTask`) — reconstruct with per-field type guards. `entityToStarred`
  shows the optional-**string** pattern (`isOptString` for ipa/meaning/context), but only `sourceLang`/
  `targetLang` are strings — **`durationMs` needs an optional-non-negative-number guard and `keywords` an
  optional-string-array guard** (r2 L-a: don't assume `isOptString` covers all four). Absent → `undefined`.
- (Both gated `src/lib/**` → 100% coverage; note `src/lib/sync` is NOT in the rule-60 §5 TDD-hook `SCOPED` set —
  coverage-gated, not hook-blocked.) Test: a task WITH metadata survives a `flattenLocal → entityToTask`
  round-trip; a task without it reconstructs cleanly (no clobber).

### WI-3 (behavioral · patch) — the read view
- **NEW `src/components/sidebar/TaskReadView.tsx` (+ test)** — props `{ task: Task; sessionName: string; onBack:
  () => void }`. **Back link** `‹ {sessionName}` → `onBack`; a **pinned header** (⇄/✦ badge + kind label +
  direction `{sourceLang}→{targetLang}` **if both present** + latency from `durationMs` **if present** + age from
  `createdAt`); content — translate: **Source**(`sourceText`) + **Result**(`resultText`); polish:
  **Original**(`sourceText`) + **Polished**(`resultText`) + **Keywords kept** chips **if `keywords?.length`**; the
  **missing-result** edge when `resultText==''` (Copy disabled). **Sticky action row**: **Copy** (guarded
  `navigator.clipboard?.writeText(resultText)`) + **Open in workspace ›**
  (`loadSourceIntoWorkspace(task.sourceText)`). **Render-only.** Bidi `dir` = **`resolveBidiDirection(sourceText,
  'auto')`** (the `src/lib/translation/bidi.ts` primitive TranslatePanel already consumes via `bidiAttrs`;
  returns `'ltr'|'rtl'`) — NOT `detectDirection` (r2 M). i18n keys.
- **i18n** — `task.read.{source,result,original,polished,keywords,copy,openInWorkspace,noResult,translation,polish}`.

### WI-4 (behavioral · FINAL · minor) — row interactivity + wiring
- **`src/components/sidebar/SessionsView.tsx`** — `TaskRow` becomes a **relative `<div>` holding TWO SIBLING
  buttons** (H3 — NOT nested): a **body button** covering the row (`onClick → onOpen(task)`) + a separate **`↗`
  button** (`onClick` does `e.stopPropagation()` + `loadSourceIntoWorkspace(task.sourceText)`). The `↗` is
  hover/focus-revealed on desktop and **always present below 600px** via **`useViewportTier()`** (L8 — called
  directly; `SessionsView` takes no props) with a transparent ≥44px pad. The trailing `›` stays; badges (⇄/✦)
  unchanged. SessionsView holds a `readTaskId` state → when set, render `<TaskReadView>` instead of the task list
  (a layer like the existing session-detail toggle); `onBack` clears it.

### Open-in-workspace target — Gate-1 decision (M6)
`loadSourceIntoWorkspace` has ONE target: the **translate** source (the only `onLoadSource` consumer). v1 reuses
it for **both** kinds — a polish task's `sourceText` (the original draft) loads into the **translate** source.
This is **consistent with #24/#22** (a starred sentence also loads into translate) and keeps scope bounded.
**Documented limitation:** a polish task re-opens in translate, not the polish Original; a polish-pane-targeted
load (a new `loadOriginal` event + PolishPanel listener) is a noted **follow-up**, not v1.

### Files OUT of scope
- The diff engine, the operation store internals (we only READ `op.elapsedMs`), the Starred surface (pattern
  mirrored, not shared), a polish-targeted load path (follow-up). No `PERSIST_VERSION` bump.

## Prior art / precedent
- **Starred detail (#22)** — read-view pattern + the `entityToStarred` optional-field sync guard WI-2 mirrors.
- **#24 `loadSourceIntoWorkspace`** — the Open-in-workspace event (translate-target), reused for the `↗` + action.
- **#14 `recordRunIfNew`** — the record path WI-1 extends. **`useViewportTier`** (L8), **`detectDirection`** (L9).

## Work items
- **WI-1** (foundational·patch) — Task optional metadata + capture chain (recordTask/autoRecord/useAutoRecordTask
  + both panels). **No version bump.**
- **WI-2** (foundational·patch) — sync round-trip (`seed.ts`/`reconstruct.ts`) for the new fields.
- **WI-3** (behavioral·patch) — `TaskReadView` (render-only; all states incl. missing-result + RTL + degrade).
- **WI-4** (behavioral·FINAL·minor) — `SessionsView` row (two sibling buttons) → read-view + `↗` + back nav.

## Test catalogue
- `sessionStore` — `addTask` stores the optionals when provided + omits cleanly when not; **existing
  `migrateSessions(state,2)===state` still passes (no bump)**.
- `recordTask`/`autoRecord` — `recordRunIfNew` captures `durationMs=op.elapsedMs` + forwards langs/keywords;
  records `undefined` when absent; idempotent per runId.
- `TranslatePanel`/`PolishPanel` — the recorded task carries `sourceLang/targetLang` (translate) / `keywords`
  (polish) (assert via the record path / a spy).
- `sync seed+reconstruct` — a task WITH metadata survives `flattenLocal → entityToTask` round-trip; a task
  WITHOUT it reconstructs cleanly (the clobber is gone).
- `TaskReadView` — translate shows Source+Result; polish shows Original+Polished+Keywords (when present);
  direction/latency/keywords **omitted when absent** (old/synced degrade); missing-`resultText` → no-result edge
  + Copy disabled; Copy calls `clipboard.writeText(resultText)`; Open calls `loadSourceIntoWorkspace(sourceText)`;
  back calls `onBack`; RTL `dir` via `resolveBidiDirection` (Arabic source → `rtl`), incl. when `sourceLang` absent.
- `SessionsView` — clicking the row BODY opens the read view (list hidden); the `↗` calls
  `loadSourceIntoWorkspace` AND does NOT open the read view (stopPropagation); back returns to the list; `↗`
  always rendered when `useViewportTier()` is phone (mock `matchMedia`).

## Risks + mitigations
- **Sync clobber (H1)** — WI-2 extends `flattenLocal`/`entityToTask`; round-trip test proves the metadata
  survives + absent fields don't break old tasks.
- **History wipe via version bump (H4)** — explicitly NO bump; the migration test guards it.
- **Lang/keyword capture coupling (H2)** — threaded through `useAutoRecordTask` (the panels pass them); old tasks
  + non-passing call sites record `undefined` (graceful).
- **Invalid nested buttons (H3)** — two sibling buttons in a relative div; a test asserts the `↗` stops
  propagation.
- **Clipboard in tests/SSR** — `navigator.clipboard?.` guard; disabled when unavailable / no result.
- **Polish→translate load mismatch (M6)** — accepted + documented (consistent with #24); polish-targeted load is
  a follow-up.

## Backward compat
Purely additive: optional Task fields (old/synced → `undefined`), **no `PERSIST_VERSION` bump**, the sync
projection extended to carry-or-omit them, a new read-view layer, an interactive row. Older clients ignore the
new optional fields. Existing list/search/rename/record/sync flows unchanged.

## Audit fixes applied (Gate 2, round 1 → v2)
Round 1 = NEEDS REVISION (4 High + 3 Med). All addressed:
- **H1** sync allow-list → WI-2 extends `seed.ts`/`reconstruct.ts` (was wrongly "out of scope").
- **H2** langs not on `op` → threaded through `useAutoRecordTask` from the panels (now in scope).
- **H3** button-in-button → two sibling buttons in a relative div.
- **H4** dangerous `PERSIST_VERSION` bump → removed (additive-optional needs none).
- **M5** `recordTask.ts` added to scope. **M6** polish-load target decided (translate, documented + follow-up).
  **M7** `durationMs = op.elapsedMs` (timing exists). **L8** `useViewportTier()` directly + matchMedia mock.
  **L9** `detectDirection(sourceText)` fallback for `dir`.

## Gate-2 round-2 fix (v3)
Round 2 = NEEDS REVISION (1 Med + 4 Low; all 4 r1 High confirmed closed + sound). Addressed:
- **M (new)** — the RTL `dir` fallback named `detectDirection` (returns the translation route `zh-en|en-zh`, not
  a bidi dir → Arabic source would render LTR, rule 66 §3). Swapped to **`resolveBidiDirection(sourceText,
  'auto')`** (`bidi.ts`, `'ltr'|'rtl'` — TranslatePanel already uses `bidiAttrs` from there). Updated the table,
  WI-3 surface, and the test assertion.
- **L-a** WI-2 reconstruct needs a non-negative-number guard (`durationMs`) + an optional-string-array guard
  (`keywords`), not just `isOptString`. **L-b** `useAutoRecordTask` meta: spread primitive deps / memoize.
  **L-c** corrected the hook-scope tag (`src/lib/sync` is coverage-gated, not rule-60 §5 hook-blocked). **L-d**
  TranslatePanel must move `labels` above the `useAutoRecordTask` call.

## Revision history
- v1 (2026-06-30) — initial draft.
- v2 (2026-06-30) — Gate-2 round-1 fixes (4 High + 3 Med). Re-split into 4 WIs (capture / sync / read view / row).
- v3 (2026-06-30) — Gate-2 round-2 fix (1 Med: bidi helper; 4 Low). **Gate-2 PASSED** (0 open Crit/High/Med; the
  r2 Medium closed by the `resolveBidiDirection` swap + its test).

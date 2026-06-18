# Bugs

Bug tracker for lucid. Lifecycle: `OPEN → IN PROGRESS → FIXED → VERIFIED` (`REOPENED` for
regressions). One row per bug; expanded repro/expected/actual below the table.

| ID | Title | Status | Severity | Notes |
|----|-------|--------|----------|-------|
| 1 | session/task/term ids collide after reload (in-memory counter not reconciled with persisted state) | FIXED | high | Counter-based `genId` resets to 0 each load → re-issued live ids after rehydration. Also blocked #9 sync (counter ids aren't globally unique → cross-device collision). Fixed v0.6.12 (PR #67): prod mints `${prefix}_${randomUuid()}` (`src/lib/uuid.ts` — `crypto.randomUUID` + insecure-context `getRandomValues` fallback); test seams keep deterministic counters. Also fixed the mirror hook's column parse (was a no-op). Gate-4 CLEAN (2-round Codex). GH: #55 |
| 2 | Provider Settings dialog content clipped — right detail pane (test-connection card/button, API-key input, stat tiles, privacy note) sheared off | FIXED | medium | The 880px-designed SettingsDialog renders clamped: the shared `DialogContent` base className ends with `sm:max-w-lg` (512px), which tailwind-merge won't reconcile against SettingsDialog's unprefixed `max-w-[880px]` (different variant group), so at ≥640px viewports `sm:max-w-lg` wins and `overflow-hidden` shears the right pane. NOT a feature-#9 regression (`dialog.tsx`/`SettingsDialog.tsx` predate the sync work). Same latent cap on `SyncSettingsDialog` (`max-w-[520px]`≈512px, not visibly clipped). **Fixed v0.7.1:** `sm:`-scoped all 3 DialogContent width overrides (`sm:max-w-[880px]`/`[520px]`/`[420px]`) so tailwind-merge keeps them over the base `sm:max-w-lg` — fixed at the call site, primitive untouched (rule 32); + a regression test asserting the merged class; verified via headless-Chromium CDP (dialog 880px, `clipped:false`). Gate-4 CLEAN (independent Claude auditor). GH: #90 |

## Open Bug Details

### Bug #1 — session/task/term ids collide after reload

**Repro:** create a session + task (gets `s1`, `t2`), reload the page (zustand rehydrates them), click "new session". `genId` restarts its module counter at 0, so it re-issues `s1` — now two sessions share an id.

**Expected:** every session/task/term id is unique and stable across reloads (and across devices, for #9 sync).

**Actual:** `renameSession`/`deleteSession`/`addTask` match by id, so an operation on one `s1` hits both. Data-integrity bug. Surfaced by the Gate-4 audit of feature #9 WI-1a.

**Root cause:** `src/stores/sessionStore.ts` + `src/stores/glossaryStore.ts` mint ids from a module-level counter (`let idSeq = 0; genId = …${++idSeq}`) that is not persisted/reconciled on rehydrate. (`polishKeywordsStore` is unaffected — its ids are value-derived since WI-1c.)

**Fix:** mint globally-unique ids with `crypto.randomUUID()` in production (collision-free across reloads AND devices); the existing `__resetSessionIds`/`__resetGlossaryIds` test seams install a deterministic counter so tests keep stable ids.

### Bug #2 — Provider Settings dialog content clipped on the right

**Repro:** on a desktop viewport (≥640px), click **Settings** (top-right). The provider Settings dialog opens with its right detail pane clipped at the dialog's right edge — the "Not tested" test-connection card's button, the right portion of the "Paste your key…" API-key input, the LAST + RATE stat tiles, and the "Held in memory…" privacy note are sheared off.

**Expected:** the dialog renders at its 880px design width (252px left rail + ~628px right pane); all right-pane content (test card + button, full key input, both stat-tile columns, privacy note) is fully visible.

**Actual:** the dialog is clamped well below 880px and the right pane is cut off by the DialogContent's `overflow-hidden`.

**Root cause (hypothesis):** `src/components/ui/dialog.tsx` `DialogContent` base className ends with `… sm:max-w-lg` (32rem / 512px). `SettingsDialog` (`src/components/workspace/SettingsDialog.tsx:101`) passes `className="max-w-[880px] …"` (unprefixed). `cn()`/tailwind-merge reconciles same-variant `max-w-*` (so the base unprefixed `max-w-[calc(100%-2rem)]` → `max-w-[880px]`) but does NOT merge the `sm:`-prefixed `sm:max-w-lg` against the unprefixed override. At ≥640px the `sm:max-w-lg` media-query rule wins → the dialog caps at ~512px → the 880px two-pane content overflows and `overflow-hidden` clips it. Likely fix (for /fix-issue): override at the same variant — `sm:max-w-[880px]` on `SettingsDialog` — or drop `sm:max-w-lg` from the shared `DialogContent` base so callers' `max-w-*` wins. The same latent cap affects the new `SyncSettingsDialog` (`max-w-[520px]` ≈ 512px, so not visibly clipped); fixing the shared primitive covers both.

**Not a regression from feature #9:** `dialog.tsx` was last changed by `40b3420` (feature #4 WI-1) and `SettingsDialog.tsx` by feature #5 (#6) — both predate the WI-9 sync work. The clipping has existed since the 880px SettingsDialog redesign; the sync work neither introduced nor touched it.

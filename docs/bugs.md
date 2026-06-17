# Bugs

Bug tracker for lucid. Lifecycle: `OPEN → IN PROGRESS → FIXED → VERIFIED` (`REOPENED` for
regressions). One row per bug; expanded repro/expected/actual below the table.

| ID | Title | Status | Severity | Notes |
|----|-------|--------|----------|-------|
| 1 | session/task/term ids collide after reload (in-memory counter not reconciled with persisted state) | FIXED | high | Counter-based `genId` resets to 0 each load → re-issued live ids after rehydration. Also blocked #9 sync (counter ids aren't globally unique → cross-device collision). Fixed v0.6.12 (PR #67): prod mints `${prefix}_${randomUuid()}` (`src/lib/uuid.ts` — `crypto.randomUUID` + insecure-context `getRandomValues` fallback); test seams keep deterministic counters. Also fixed the mirror hook's column parse (was a no-op). Gate-4 CLEAN (2-round Codex). GH: #55 |

## Open Bug Details

### Bug #1 — session/task/term ids collide after reload

**Repro:** create a session + task (gets `s1`, `t2`), reload the page (zustand rehydrates them), click "new session". `genId` restarts its module counter at 0, so it re-issues `s1` — now two sessions share an id.

**Expected:** every session/task/term id is unique and stable across reloads (and across devices, for #9 sync).

**Actual:** `renameSession`/`deleteSession`/`addTask` match by id, so an operation on one `s1` hits both. Data-integrity bug. Surfaced by the Gate-4 audit of feature #9 WI-1a.

**Root cause:** `src/stores/sessionStore.ts` + `src/stores/glossaryStore.ts` mint ids from a module-level counter (`let idSeq = 0; genId = …${++idSeq}`) that is not persisted/reconciled on rehydrate. (`polishKeywordsStore` is unaffected — its ids are value-derived since WI-1c.)

**Fix:** mint globally-unique ids with `crypto.randomUUID()` in production (collision-free across reloads AND devices); the existing `__resetSessionIds`/`__resetGlossaryIds` test seams install a deterministic counter so tests keep stable ids.
